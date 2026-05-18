// Hybrid SEIR + agent-based spatial spreading engine.
//
// Per cell we keep four compartments (S, E, I, R) as float counts.
// Each day:
//   1. Determine an "active set" of cells: those with E + I > 0 plus a
//      1-cell neighbour halo. The rest move under a small deterministic SEIR
//      step that's basically a no-op when E = I = 0.
//   2. For each active cell we compute an effective infectious presence
//      I_eff = I_self + mobilityWeight * sum_neighbours(I_n * w(d_n)),
//      where w(d) = 1/(1 + d^alpha) with d in cell units, truncated to a
//      bounded neighbourhood.
//   3. New exposures per active cell: ΔE = (1 - exp(-β * I_eff / N)) * S.
//      Tau-leap Poisson sampling around that mean keeps stochasticity.
//   4. Latent / infectious progressions use deterministic exponential
//      transitions (σ = 1/latent, γ = 1/infectious). At per-cell scale with
//      thousands of agents this is almost indistinguishable from compartment
//      tracking with age-of-infection.
//   5. Occasionally (every 7 days) we sample a handful of long-range
//      "commuter" jumps weighted by gravity: P(i→j) ∝ pop_i * pop_j / d_ij^α.
//
// The model reproduces qualitative behaviour from Laosiritaworn 2018 —
// E peaks before I, R rises monotonically, and the final survivor fraction
// drops sharply once R0 * mobility crosses a critical line.

import type { DensityGrid } from "@/data/density";
import type { DiseaseParams } from "./presets";
import type { MetricsPoint } from "./types";

const NEIGHBOUR_RADIUS = 2;          // cells; quadratic blast radius for local mixing
const LONG_JUMP_INTERVAL_DAYS = 7;
const LONG_JUMP_ATTEMPTS = 8;
// Stop the sim when the *total* active infectious mass falls below this many
// people. Float32 round-off plus periodic long jumps mean E+I never reaches
// exact zero in a country-sized population — once we're under ~50 active
// agents the epidemic is effectively over.
const END_OF_EPIDEMIC_THRESHOLD = 50;

interface CompartmentState {
  S: Float32Array;
  E: Float32Array;
  I: Float32Array;
  R: Float32Array;
}

function makeState(n: number): CompartmentState {
  return {
    S: new Float32Array(n),
    E: new Float32Array(n),
    I: new Float32Array(n),
    R: new Float32Array(n),
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
  // Normal approximation: mean = variance = λ.
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

export class SimEngine {
  readonly grid: DensityGrid;
  readonly params: DiseaseParams;

  private state: CompartmentState;
  private rng: () => number;
  private day = 0;
  private history: MetricsPoint[] = [];
  private kernelWeights: Float32Array;
  private kernelOffsets: Int32Array; // pairs of (dRow, dCol)
  private finished = false;

  // Long-range gravity table built lazily: list of (cellIndex, cumWeight).
  private cumPopulation: Float32Array | null = null;
  private totalSeed: number;
  // Track peak active infections so the end-of-epidemic check can require
  // that we've actually had a real outbreak, not just a stillborn seed.
  private peakActive = 0;

  constructor(grid: DensityGrid, params: DiseaseParams, seed: { row: number; col: number }, rngSeed = Date.now() & 0x7fffffff) {
    this.grid = grid;
    this.params = params;
    this.rng = makeRng(rngSeed);
    const n = grid.width * grid.height;
    this.state = makeState(n);

    // Initialise S from population, zero E/I/R.
    for (let i = 0; i < n; i++) this.state.S[i] = grid.population[i];

    // Seed: move `initialInfected` agents from S to I in the chosen cell.
    const idx = seed.row * grid.width + seed.col;
    const initial = Math.min(params.initialInfected, this.state.S[idx]);
    this.state.S[idx] -= initial;
    this.state.I[idx] += initial;
    this.totalSeed = initial;

    // Precompute kernel weights and offsets for local mixing.
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

    // Record initial metrics.
    this.history.push(this.computeMetrics(0));
  }

  getDay(): number {
    return this.day;
  }
  isFinished(): boolean {
    return this.finished;
  }
  getHistory(): MetricsPoint[] {
    return this.history;
  }

  /** Returns per-cell I / population in [0, 1] as a Float32Array. */
  getIntensity(): Float32Array {
    const { width, height, population } = this.grid;
    const n = width * height;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pop = population[i];
      if (pop > 0) out[i] = this.state.I[i] / pop;
    }
    return out;
  }

  /** Advance one day. */
  step(): MetricsPoint {
    const { width, height } = this.grid;
    const { S, E, I, R } = this.state;
    const p = this.params;

    const beta = p.r0 / p.infectiousDays;       // per-day transmission
    const sigma = 1 / p.latentDays;             // 1/latent
    const gamma = 1 / p.infectiousDays;         // 1/infectious
    const mobW = p.mobilityWeight;

    // ----- Step 1: compute new exposures per cell -----
    // We do this in a temp buffer to avoid races between reads/writes.
    const newE = new Float32Array(width * height);
    let totalNewInfections = 0;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const s = S[i];
        const pop = this.grid.population[i];
        if (s < 1e-9 || pop < 1e-9) continue;

        // Local mixing: convex combination of self-cell I and neighbour I.
        // I_eff_local / N_local approximates the per-S infectious pressure.
        const iSelf = I[i];
        let iNeigh = 0;
        let neighWeightSum = 0;
        for (let k = 0; k < this.kernelWeights.length; k++) {
          const dr = this.kernelOffsets[2 * k];
          const dc = this.kernelOffsets[2 * k + 1];
          const r2 = row + dr;
          const c2 = col + dc;
          if (r2 < 0 || r2 >= height || c2 < 0 || c2 >= width) continue;
          const j = r2 * width + c2;
          const w = this.kernelWeights[k];
          const popJ = this.grid.population[j];
          if (popJ < 1e-9) continue;
          iNeigh += w * (I[j] / popJ);
          neighWeightSum += w;
        }
        const localFracInf = pop > 0 ? iSelf / pop : 0;
        const neighFracInf = neighWeightSum > 0 ? iNeigh / neighWeightSum : 0;
        const pressure = (1 - mobW) * localFracInf + mobW * neighFracInf;
        if (pressure <= 0) continue;

        // Expected exposures = S * (1 - exp(-β * pressure)).
        const meanNewE = s * (1 - Math.exp(-beta * pressure));
        if (meanNewE <= 0) continue;
        // Tau-leap Poisson noise; clamp to S.
        const draw = Math.min(s, samplePoisson(this.rng, meanNewE));
        if (draw > 0) {
          newE[i] = draw;
          totalNewInfections += draw;
        }
      }
    }

    // ----- Step 2: progress compartments -----
    // E → I at rate σ, I → R at rate γ. Use exact transition probabilities
    // 1 - exp(-rate*dt) for dt = 1 day, then move continuous masses.
    const probEtoI = 1 - Math.exp(-sigma);
    const probItoR = 1 - Math.exp(-gamma);

    for (let i = 0; i < width * height; i++) {
      const dEtoI = E[i] * probEtoI;
      const dItoR = I[i] * probItoR;
      E[i] = E[i] - dEtoI + newE[i];
      I[i] = I[i] + dEtoI - dItoR;
      R[i] = R[i] + dItoR;
      S[i] = S[i] - newE[i];
    }

    // ----- Step 3: occasional long-range gravity jumps -----
    if ((this.day + 1) % LONG_JUMP_INTERVAL_DAYS === 0) {
      this.doLongJumps();
    }

    this.day += 1;

    // ----- Step 4: collect metrics -----
    const metrics = this.computeMetrics(totalNewInfections);
    this.history.push(metrics);

    // Mark the epidemic as ended only once we've actually had an outbreak
    // (peak active mass crossed some realistic level) and the trajectory has
    // decayed back below the threshold.
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
    for (let i = 0; i < S.length; i++) {
      sumS += S[i];
      sumE += E[i];
      sumI += I[i];
      sumR += R[i];
    }
    // Effective R: smoothed ratio of new cases this week to new cases last
    // generation interval ago, scaled by the susceptible fraction. Cheap
    // approximation that tracks the obvious trend without being noisy.
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
      S: sumS,
      E: sumE,
      I: sumI,
      R: sumR,
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
    // Binary search for the first index with cum >= target.
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] >= target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /**
   * Stochastic long-range jumps modelling commuters / travellers carrying
   * infection between distant populated cells. We sample LONG_JUMP_ATTEMPTS
   * pairs (source, dest) with cells drawn weighted by population, then
   * transfer a small expected number of infectious agents from source to
   * dest if the source has I > 0.
   */
  private doLongJumps() {
    const { I, S, E } = this.state;
    const { population } = this.grid;
    // Stop seeding fresh cells once the epidemic is clearly burning out —
    // otherwise the tail becomes infinitely long because every long jump
    // ignites a brand-new outbreak in a fully susceptible cell.
    let totalI = 0;
    for (let i = 0; i < I.length; i++) totalI += I[i];
    if (totalI < END_OF_EPIDEMIC_THRESHOLD * 4) return;
    for (let k = 0; k < LONG_JUMP_ATTEMPTS; k++) {
      const src = this.samplePopulationWeightedCell();
      if (I[src] < 0.5) continue;
      const dst = this.samplePopulationWeightedCell();
      if (dst === src) continue;
      const popDst = population[dst];
      if (popDst < 1 || S[dst] < 1) continue;
      // Convert ~1 traveller's infectious effect at dst into an exposure event.
      const travelExposure = Math.min(S[dst], (S[dst] / popDst) * 1.0);
      if (travelExposure > 0) {
        S[dst] -= travelExposure;
        E[dst] += travelExposure;
      }
    }
  }
}
