import { create } from "zustand";
import type { Resolution } from "@/data/density";
import {
  PRESETS, DEFAULT_PRESET, type DiseaseParams, type PresetId,
} from "@/sim/presets";
import type { MetricsPoint } from "@/sim/types";

interface SeedPoint {
  lng: number;
  lat: number;
}

interface GridMeta {
  width: number;
  height: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  cellSizeKm: number;
  population: Float32Array;
  totalPopulation: number;
}

export interface VizSettings {
  /** 0..1 alpha for the population-density layer. */
  densityAlpha: number;
  /** 0..1 alpha for the infection-intensity overlay. */
  infectionAlpha: number;
  /**
   * Population at which the density color ramp saturates to its max color.
   * Cells at or above this value all paint the brightest viridis stop.
   */
  densityMax: number;
  /**
   * Infected fraction (I/pop) at which the infection ramp saturates.
   * 0.2 = 20% infected in a cell paints the brightest red.
   */
  infectionMax: number;
}

interface SimStore {
  // Parameters
  preset: PresetId;
  params: DiseaseParams;
  resolution: Resolution;
  seed: SeedPoint | null;
  /** Target total population in millions; the synthetic grid is rescaled to match. */
  targetPopulationMillions: number;

  // Sim runtime
  running: boolean;
  finished: boolean;
  day: number;
  speedDaysPerSec: number;
  history: MetricsPoint[];
  latestMetrics: MetricsPoint | null;

  // Grid data from worker
  gridMeta: GridMeta | null;
  intensity: Float32Array | null;

  // Visualization settings
  viz: VizSettings;

  // Actions
  setPreset: (p: PresetId) => void;
  updateParam: <K extends keyof DiseaseParams>(key: K, value: DiseaseParams[K]) => void;
  setResolution: (r: Resolution) => void;
  setSeed: (s: SeedPoint | null) => void;
  setRunning: (r: boolean) => void;
  setSpeed: (s: number) => void;
  setTargetPopulationMillions: (m: number) => void;
  updateViz: <K extends keyof VizSettings>(key: K, value: VizSettings[K]) => void;
  applyFrame: (day: number, intensity: Float32Array, metrics: MetricsPoint) => void;
  setGridMeta: (g: GridMeta) => void;
  setFinished: (history: MetricsPoint[]) => void;
  resetHistory: () => void;
}

export const useSimStore = create<SimStore>((set) => ({
  preset: DEFAULT_PRESET,
  params: { ...PRESETS[DEFAULT_PRESET] },
  resolution: "5km",
  seed: { lng: 100.5018, lat: 13.7563 }, // Bangkok as default seed
  targetPopulationMillions: 70, // Thailand's roughly-real total

  running: false,
  finished: false,
  day: 0,
  speedDaysPerSec: 10,
  history: [],
  latestMetrics: null,

  gridMeta: null,
  intensity: null,

  viz: {
    densityAlpha: 0.85,
    infectionAlpha: 0.95,
    // Synthetic Bangkok peaks around ~30k people / 5km² cell (and ~1.2k at
    // 1km). Picking a tight default makes secondary metros visible without
    // washing out Bangkok.
    densityMax: 20000,
    // 10% of a cell currently infectious is "very hot" in practice; the
    // ramp saturates there so neighbourhood spread shows up.
    infectionMax: 0.10,
  },

  setPreset: (p) =>
    set(() => {
      if (p === "custom") return { preset: p as PresetId };
      const presetParams = PRESETS[p];
      return { preset: p as PresetId, params: { ...presetParams } };
    }),
  updateParam: (key, value) =>
    set((state) => ({
      preset: "custom",
      params: { ...state.params, [key]: value },
    })),
  setResolution: (r) => set({ resolution: r }),
  setSeed: (s) => set({ seed: s }),
  setRunning: (r) => set({ running: r }),
  setSpeed: (s) => set({ speedDaysPerSec: s }),
  setTargetPopulationMillions: (m) =>
    set({ targetPopulationMillions: Math.max(1, m) }),
  updateViz: (key, value) =>
    set((state) => ({ viz: { ...state.viz, [key]: value } })),
  applyFrame: (day, intensity, metrics) =>
    set((state) => ({
      day,
      intensity,
      latestMetrics: metrics,
      history: [...state.history, metrics],
    })),
  setGridMeta: (g) => set({ gridMeta: g }),
  setFinished: (history) => set({ finished: true, running: false, history }),
  resetHistory: () =>
    set({ history: [], latestMetrics: null, day: 0, finished: false }),
}));
