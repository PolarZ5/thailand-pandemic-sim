// Message contracts between the main thread and the simulation Web Worker.

import type { DiseaseParams } from "./presets";
import type { Resolution } from "@/data/density";

export interface InterventionMultipliers {
  home: number;
  work: number;
  school: number;
  other: number;
}

export interface InitMessage {
  type: "init";
  resolution: Resolution;
  params: DiseaseParams;
  /** Seed point — the worker resolves to (row,col) once the grid is built. */
  seed: { lng: number; lat: number };
  /** Target total population in millions (the synthetic grid is scaled to match). */
  targetPopulationMillions: number;
  interventions: InterventionMultipliers;
  /** RNG seed for reproducibility (optional). */
  rngSeed?: number;
}

export interface RunMessage {
  type: "run";
  /** Days per second of wall clock; the worker will throttle to match. */
  speedDaysPerSec: number;
}

export interface PauseMessage { type: "pause"; }
export interface StepMessage  { type: "step"; days: number; }
export interface ResetMessage {
  type: "reset";
  params: DiseaseParams;
  seed: { lng: number; lat: number };
  resolution: Resolution;
  targetPopulationMillions: number;
  interventions: InterventionMultipliers;
  rngSeed?: number;
}

export type WorkerInbound =
  | InitMessage | RunMessage | PauseMessage | StepMessage | ResetMessage;

export interface MetricsPoint {
  day: number;
  S: number;
  E: number;
  I: number;
  R: number;
  /** Effective reproduction number, smoothed estimate (NaN until day > 7). */
  Rt: number;
  /** Newly infected on this day. */
  newInfections: number;
}

export interface GridStateMessage {
  type: "grid";
  day: number;
  /** Per-cell infection intensity in [0, 1] = I / population. Length = width*height. */
  intensity: Float32Array;
  metrics: MetricsPoint;
}

export interface ReadyMessage {
  type: "ready";
  width: number;
  height: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  cellSizeKm: number;
  /** Population per cell, for choropleth coloring on the map. */
  population: Float32Array;
  totalPopulation: number;
}

export interface DoneMessage {
  type: "done";
  day: number;
  finalAttackRate: number;
  history: MetricsPoint[];
  /** Attack rate per 5-year age band (length 16). */
  ageAttackRates: number[];
}

export type WorkerOutbound = GridStateMessage | ReadyMessage | DoneMessage;
