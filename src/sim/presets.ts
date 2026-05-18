// Disease parameter presets. β is derived inside the engine from R0 and γ
// using the well-mixed approximation β = R0 / infectiousDays. These are
// reasonable starting points, not clinical truth.

export interface DiseaseParams {
  /** Basic reproduction number in a fully susceptible population. */
  r0: number;
  /** Mean latent period (E → I), in days. */
  latentDays: number;
  /** Mean infectious period (I → R), in days. */
  infectiousDays: number;
  /** Number of initial infected agents at the seed cell. */
  initialInfected: number;
  /** Gravity-kernel distance-decay exponent for between-cell mixing. */
  mobilityAlpha: number;
  /** Fraction of contacts that happen *outside* the home cell (mixing). */
  mobilityWeight: number;
}

export type PresetId = "flu" | "covid" | "measles" | "custom";

export const PRESETS: Record<Exclude<PresetId, "custom">, DiseaseParams> = {
  flu: {
    r0: 1.3,
    latentDays: 1,
    infectiousDays: 4,
    initialInfected: 5,
    mobilityAlpha: 2.0,
    mobilityWeight: 0.25,
  },
  covid: {
    r0: 2.5,
    latentDays: 5,
    infectiousDays: 7,
    initialInfected: 5,
    mobilityAlpha: 1.8,
    mobilityWeight: 0.30,
  },
  measles: {
    r0: 15,
    latentDays: 10,
    infectiousDays: 8,
    initialInfected: 5,
    mobilityAlpha: 2.0,
    mobilityWeight: 0.20,
  },
};

export const PRESET_LABELS: Record<PresetId, string> = {
  flu: "Flu-like",
  covid: "COVID-19 (original wave)",
  measles: "Measles",
  custom: "Custom",
};

export const DEFAULT_PRESET = "covid" as const;
