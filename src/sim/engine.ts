// Age-stratified spatial SEIR engine.
//
// State per cell is 16 age bands × 4 compartments (S, E, I, R) stored as
// Float32Arrays of length `cells * 16`. Mixing within a cell is driven by
// the Prem et al. 2021 synthetic contact matrices for Thailand (home +
// work + school + other), each scalable by an intervention multiplier.
//
// Per tick (1 day) we:
//   1. Build an effective contact matrix M = m_home·H + m_work·W + m_school·S + m_other·O
//      from the user's intervention sliders.
//   2. Compute a per-cell, per-age force of infection
//        λ_a = q · Σ_b M_ab · I_b / N_b
//      using locally-mixed I_b/N_b within the cell plus a gravity-weighted
//      neighbour contribution.
//   3. Sample new exposures per (cell, age) as Poisson(S_a · (1 - exp(-λ_a))).
//   4. E→I and I→R as deterministic exponential transitions at rates σ, γ.
//   5. Once per week, fire a handful of long-range "commuter" jumps weighted
//      by population to seed distant outbreaks.
//
// q is calibrated up-front so that the dominant eigenvalue of the effective
// next-generation matrix matches the user-supplied R₀ — i.e.
//   q = R₀ / (ρ(M_eff) · infectiousDays).
// That way "R₀ = 2.5" really means R₀ ≈ 2.5 at day 0, even when interventions
// change M (q is recomputed on construction; reset to re-tune mid-run).
//
// The contact matrix only governs *within-cell* mixing — between cells we
// still use the gravity-style mobility kernel from earlier versions, which
// imports neighbour I as an additional age-agnostic exposure pool.

import type { DensityGrid } from "@/data/density";
import type { DiseaseParams } from "./presets";
import type { MetricsPoint } from "./types";
import {
  M_HOME, M_WORK, M_SCHOOL, M_OTHER, THAILAND_AGE_FRACTIONS,
} from "@/data/contact-matrix";

const NEIGHBOUR_RADIUS = 2;          // cells
const LONG_JUMP_INTERVAL_DAYS = 7;
const LONG_JUMP_ATTEMPTS = 8;
const END_OF_EPIDEMIC_THRESHOLD = 50;
const N_AGE = 16;

export interface InterventionMultipliers {
  home: number;
  work: number;
  school: number;
  other: number;
}

export const DEFAULT_INTERVENTIONS: InterventionMultipliers = {
  home: 1, work: 1, school: 1, other: 1,
};

interface CompartmentState {
  /** S[cellIdx * 16 + age]. */
  S: Float32Array;
  E: Float32Array;
  I: Float32Array;
  R: Float32Array;
  /** Total population per (cell, age). Constant for the run. */
  N: Float32Array;
}

function makeState(nCells: number): CompartmentState {
  const len = nCells * N_AGE;
  return {
    S: new Float32Array(len),
    E: new Float32Array(len),
    I: new Float32Array(len),
    R: new Float32Array(len),
    N: new Float32Array(len),
  };
}

/** Mulberry32 — small, fast, deterministic PRNG. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample a Poisson variate with mean λ. Knuth for small λ, Gaussian for large. */
function samplePoisson(rng: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  }
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

/** Build a 16×16 effective contact matrix as a flat row-major Float64Array. */
function buildEffectiveMatrix(m: InterventionMultipliers): Float64Array {
  const out = new Float64Array(N_AGE * N_AGE);
  for (let i = 0; i < N_AGE; i++) {
    const row = i * N_AGE;
    for (let j = 0; j < N_AGE; j++) {
      out[row + j] =
        m.home   * M_HOME[i][j] +
        m.work   * M_WORK[i][j] +
        m.school * M_SCHOOL[i][j] +
        m.other  * M_OTHER[i][j];
    }
  }
  return out;
}

/** Power-iteration dominant eigenvalue of a row-major n×n matrix. */
function dominantEigenvalue(mat: Float64Array, n: number, iters = 60): number {
  let v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = 1 / n;
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) s += mat[row + j] * v[j];
      next[i] = s;
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += next[i] * next[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return 0;
    for (let i = 0; i < n; i++) next[i] /= norm;
    v = next;
  }
  // Rayleigh quotient.
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = i * n;
    for (let j = 0; j < n; j++) s += mat[row + j] * v[j];
    num += v[i] * s;
    den += v[i] * v[i];
  }
  return num / den;
}

export class SimEngine {
  readonly grid: DensityGrid;
  readonly params: DiseaseParams;
  private state: CompartmentState;
  private rng: () => number;
  private day = 0;
  private history: MetricsPoint[] = [];
  private kernelOffsets: Int32Array;
  private kernelWeights: Float32Array;
  private finished = false;
  private cumPopulation: Float32Array | null = null;
  /** Initial population per age (sum over all cells) — for attack-rate-by-age. */
  private readonly initialPopByAge: Float64Array;
  /** Effective 16x16 contact matrix (row-major, Float64). */
  private mEff: Float64Array;
  private interventions: InterventionMultipliers;
  /** Per-contact transmission probability, calibrated so R₀ = user value. */
  private q: number;
  private peakActive = 0;

  constructor(
    grid: DensityGrid,
    params: DiseaseParams,
    seed: { row: number; col: number },
    interventions: InterventionMultipliers = DEFAULT_INTERVENTIONS,
    rngSeed = Date.now() & 0x7fffffff,
  ) {
    this.grid = grid;
    this.params = params;
    this.interventions = interventions;
    this.rng = makeRng(rngSeed);
    const nCells = grid.width * grid.height;
    this.state = makeState(nCells);

    // Distribute each cell's population across the 16 age bands.
    for (let c = 0; c < nCells; c++) {
      const pop = grid.population[c];
      if (pop < 1e-9) continue;
      const base = c * N_AGE;
      for (let a = 0; a < N_AGE; a++) {
        const popA = pop * THAILAND_AGE_FRACTIONS[a];
        this.state.N[base + a] = popA;
        this.state.S[base + a] = popA;
      }
    }

    // Capture total population by age for end-of-run attack-rate reporting.
    this.initialPopByAge = new Float64Array(N_AGE);
    for (let c = 0; c < nCells; c++) {
      const base = c * N_AGE;
      for (let a = 0; a < N_AGE; a++) this.initialPopByAge[a] += this.state.N[base + a];
    }

    // Seed: place `initialInfected` agents in the seed cell, split across
    // age bands by the country pyramid. They start in I (skip latent).
    const seedIdx = seed.row * grid.width + seed.col;
    const seedBase = seedIdx * N_AGE;
    let seeded = 0;
    for (let a = 0; a < N_AGE; a++) {
      const want = params.initialInfected * THAILAND_AGE_FRACTIONS[a];
      const take = Math.min(want, this.state.S[seedBase + a]);
      this.state.S[seedBase + a] -= take;
      this.state.I[seedBase + a] += take;
      seeded += take;
    }
    void seeded;

    // Precompute mobility kernel weights / offsets (between-cell, age-agnostic).
    const offsets: number[] = [];
    const weights: number[] = [];
    for (let dr = -NEIGHBOUR_RADIUS; dr <= NEIGHBOUR_RADIUS; dr++) {
      for (let dc = -NEIGHBOUR_RADIUS; dc <= NEIGHBOUR_RADIUS; dc++) {
        if (dr === 0 && dc === 0) continue;
        const d = Math.sqrt(dr * dr + dc * dc);
        offsets.push(dr, dc);
        weights.push(1 / Math.pow(1 + d, params.mobilityAlpha));
      }
    }
    this.kernelOffsets = Int32Array.from(offsets);
    this.kernelWeights = Float32Array.from(weights);

    // Build the effective contact matrix and calibrate q from R₀.
    this.mEff = buildEffectiveMatrix(interventions);
    const rho = dominantEigenvalue(this.mEff, N_AGE);
    // R₀ = q · ρ(M) · infectiousDays in this NGM closure.
    this.q = rho > 0
      ? params.r0 / (rho * params.infectiousDays)
      : 0;

    this.history.push(this.computeMetrics(0));
  }

  getDay(): number { return this.day; }
  isFinished(): boolean { return this.finished; }
  getHistory(): MetricsPoint[] { return this.history; }
  getInitialPopByAge(): Float64Array { return this.initialPopByAge; }

  /** I (summed across age) divided by population, per cell, for the heatmap. */
  getIntensity(): Float32Array {
    const { width, height, population } = this.grid;
    const n = width * height;
    const out = new Float32Array(n);
    const { I } = this.state;
    for (let c = 0; c < n; c++) {
      const pop = population[c];
      if (pop < 1e-9) continue;
      let iSum = 0;
      const base = c * N_AGE;
      for (let a = 0; a < N_AGE; a++) iSum += I[base + a];
      out[c] = iSum / pop;
    }
    return out;
  }

  /** Age-stratified attack rates (R + I + E) / N_initial[a]. */
  getAgeAttackRates(): number[] {
    const out = new Array<number>(N_AGE).fill(0);
    const { E, I, R, N } = this.state;
    const everInf = new Float64Array(N_AGE);
    const popA = new Float64Array(N_AGE);
    const nCells = this.grid.width * this.grid.height;
    for (let c = 0; c < nCells; c++) {
      const base = c * N_AGE;
      for (let a = 0; a < N_AGE; a++) {
        everInf[a] += E[base + a] + I[base + a] + R[base + a];
        popA[a] += N[base + a];
      }
    }
    for (let a = 0; a < N_AGE; a++) {
      out[a] = popA[a] > 0 ? everInf[a] / popA[a] : 0;
    }
    return out;
  }

  /** Replace the active intervention multipliers and re-calibrate q. */
  setInterventions(m: InterventionMultipliers) {
    this.interventions = m;
    this.mEff = buildEffectiveMatrix(m);
    const rho = dominantEigenvalue(this.mEff, N_AGE);
    this.q = rho > 0 ? this.params.r0 / (rho * this.params.infectiousDays) : 0;
  }

  /** Advance one day. */
  step(): MetricsPoint {
    const { width, height } = this.grid;
    const { S, E, I, R, N } = this.state;
    const p = this.params;
    const sigma = 1 / p.latentDays;
    const gamma = 1 / p.infectiousDays;
    const mobW = p.mobilityWeight;
    const probEtoI = 1 - Math.exp(-sigma);
    const probItoR = 1 - Math.exp(-gamma);

    const nCells = width * height;
    const newE = new Float32Array(nCells * N_AGE);
    let totalNewInfections = 0;

    // Scratch buffer of per-age "imported" infectious fraction (from neighbours).
    const importedFrac = new Float64Array(N_AGE);

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const c = row * width + col;
        const cellBase = c * N_AGE;
        const cellPop = this.grid.population[c];
        if (cellPop < 1e-9) continue;

        // Skip cells with no susceptibles AND no exposed/infected nearby.
        // Quick check: any S?
        let sSum = 0;
        for (let a = 0; a < N_AGE; a++) sSum += S[cellBase + a];
        if (sSum < 1e-9) {
          // still need to advance E→I, I→R below
        }

        // ---- Within-cell: I_self_b / N_self_b vector ----
        // We'll multiply M_eff into this to get λ for each S_a.
        // Re-use the imported buffer; index later carefully.
        const localIfrac = new Float64Array(N_AGE);
        for (let b = 0; b < N_AGE; b++) {
          const n = N[cellBase + b];
          if (n > 0) localIfrac[b] = I[cellBase + b] / n;
        }

        // ---- Between-cell: aggregate neighbour I_b/N_b weighted by kernel ----
        // Age-agnostic shortcut: compute neighbour-weighted scalar I/N
        // then apply uniformly across ages. This keeps the gravity-style
        // long-distance leak without ballooning compute by a 16x.
        let neighScalarI = 0;
        let neighScalarN = 0;
        for (let k = 0; k < this.kernelWeights.length; k++) {
          const dr = this.kernelOffsets[2 * k];
          const dc = this.kernelOffsets[2 * k + 1];
          const r2 = row + dr;
          const c2 = col + dc;
          if (r2 < 0 || r2 >= height || c2 < 0 || c2 >= width) continue;
          const j = r2 * width + c2;
          const popJ = this.grid.population[j];
          if (popJ < 1e-9) continue;
          const w = this.kernelWeights[k];
          let iJ = 0;
          let nJ = 0;
          const baseJ = j * N_AGE;
          for (let a = 0; a < N_AGE; a++) {
            iJ += I[baseJ + a];
            nJ += N[baseJ + a];
          }
          neighScalarI += w * iJ;
          neighScalarN += w * nJ;
        }
        const importedScalarFrac = neighScalarN > 0 ? neighScalarI / neighScalarN : 0;
        for (let a = 0; a < N_AGE; a++) importedFrac[a] = importedScalarFrac;

        // ---- Force of infection per age: λ_a = q · Σ_b M_ab · pressure_b ----
        // pressure_b = (1 - mobW) * localIfrac[b] + mobW * importedFrac[b].
        const pressure = new Float64Array(N_AGE);
        for (let b = 0; b < N_AGE; b++) {
          pressure[b] = (1 - mobW) * localIfrac[b] + mobW * importedFrac[b];
        }

        for (let a = 0; a < N_AGE; a++) {
          const sA = S[cellBase + a];
          if (sA < 1e-9) continue;
          let lambda = 0;
          const matRow = a * N_AGE;
          for (let b = 0; b < N_AGE; b++) {
            lambda += this.mEff[matRow + b] * pressure[b];
          }
          lambda *= this.q;
          if (lambda <= 0) continue;
          const meanNewE = sA * (1 - Math.exp(-lambda));
          if (meanNewE <= 0) continue;
          const draw = Math.min(sA, samplePoisson(this.rng, meanNewE));
          if (draw > 0) {
            newE[cellBase + a] = draw;
            totalNewInfections += draw;
          }
        }
      }
    }

    // Progress compartments.
    const total = nCells * N_AGE;
    for (let i = 0; i < total; i++) {
      const dEtoI = E[i] * probEtoI;
      const dItoR = I[i] * probItoR;
      E[i] = E[i] - dEtoI + newE[i];
      I[i] = I[i] + dEtoI - dItoR;
      R[i] = R[i] + dItoR;
      S[i] = S[i] - newE[i];
    }

    if ((this.day + 1) % LONG_JUMP_INTERVAL_DAYS === 0) this.doLongJumps();

    this.day += 1;
    const metrics = this.computeMetrics(totalNewInfections);
    this.history.push(metrics);
    const active = metrics.E + metrics.I;
    if (active > this.peakActive) this.peakActive = active;
    const peakHit = this.peakActive >= Math.max(
      END_OF_EPIDEMIC_THRESHOLD * 10,
      this.params.initialInfected * 5,
    );
    if (peakHit && active < END_OF_EPIDEMIC_THRESHOLD) this.finished = true;
    return metrics;
  }

  private computeMetrics(newInfections: number): MetricsPoint {
    const { S, E, I, R } = this.state;
    let sumS = 0, sumE = 0, sumI = 0, sumR = 0;
    const total = S.length;
    for (let i = 0; i < total; i++) {
      sumS += S[i];
      sumE += E[i];
      sumI += I[i];
      sumR += R[i];
    }
    let rt = NaN;
    if (this.day >= 7 && this.history.length >= 7) {
      const recent = this.history.slice(-7).reduce((a, b) => a + b.newInfections, 0) + newInfections;
      const past = this.history.slice(-14, -7).reduce((a, b) => a + b.newInfections, 0);
      if (past > 0) {
        const totalPop = this.grid.totalPopulation || 1;
        rt = (recent / Math.max(past, 1)) * (sumS / totalPop) * this.params.r0;
      }
    }
    return {
      day: this.day,
      S: sumS, E: sumE, I: sumI, R: sumR,
      Rt: rt,
      newInfections,
    };
  }

  private buildCumPop() {
    const { width, height, population } = this.grid;
    const n = width * height;
    const cum = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += population[i];
      cum[i] = total;
    }
    this.cumPopulation = cum;
  }
  private samplePopulationWeightedCell(): number {
    if (!this.cumPopulation) this.buildCumPop();
    const cum = this.cumPopulation!;
    const total = cum[cum.length - 1];
    const target = this.rng() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] >= target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  private doLongJumps() {
    const { I, S, E, N } = this.state;
    let totalI = 0;
    for (let i = 0; i < I.length; i++) totalI += I[i];
    if (totalI < END_OF_EPIDEMIC_THRESHOLD * 4) return;
    for (let k = 0; k < LONG_JUMP_ATTEMPTS; k++) {
      const src = this.samplePopulationWeightedCell();
      const srcBase = src * N_AGE;
      let iSrc = 0;
      for (let a = 0; a < N_AGE; a++) iSrc += I[srcBase + a];
      if (iSrc < 0.5) continue;
      const dst = this.samplePopulationWeightedCell();
      if (dst === src) continue;
      const dstBase = dst * N_AGE;
      // Spread one traveller's worth of exposure across the destination's
      // age groups, weighted by their relative S share.
      let sDst = 0;
      for (let a = 0; a < N_AGE; a++) sDst += S[dstBase + a];
      if (sDst < 1) continue;
      for (let a = 0; a < N_AGE; a++) {
        const sA = S[dstBase + a];
        if (sA < 1e-9) continue;
        const share = sA / sDst;
        const exposure = Math.min(sA, share * (sDst / (N[dstBase + a] || 1)) * 1.0);
        if (exposure > 0) {
          S[dstBase + a] -= exposure;
          E[dstBase + a] += exposure;
        }
      }
    }
  }
}
