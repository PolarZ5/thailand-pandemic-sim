// Simulation Web Worker. Hosts the SimEngine; ticks on a setTimeout cadence
// so the main thread stays responsive.

/// <reference lib="webworker" />

import {
  buildSyntheticDensity, lngLatToCell, type DensityGrid,
} from "@/data/density";
import { SimEngine } from "./engine";
import type {
  WorkerInbound, WorkerOutbound, GridStateMessage, ReadyMessage, DoneMessage,
} from "./types";

declare const self: DedicatedWorkerGlobalScope;

let engine: SimEngine | null = null;
let grid: DensityGrid | null = null;
let running = false;
let speedDaysPerSec = 5;
let pendingFrame: ReturnType<typeof setTimeout> | null = null;

/**
 * If the clicked cell has no people, scan a spiral around it to find the
 * closest cell with non-zero population so the seed actually takes hold.
 * If no populated cell is found within `maxR` cells we just return the
 * original click — engine.ts will clamp initial infected to 0 in that case.
 */
function pickPopulatedCell(
  g: DensityGrid,
  row: number,
  col: number,
  maxR = 25,
): { row: number; col: number } {
  if (g.population[row * g.width + col] >= 1) return { row, col };
  for (let r = 1; r <= maxR; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= g.height || nc < 0 || nc >= g.width) continue;
        if (g.population[nr * g.width + nc] >= 1) return { row: nr, col: nc };
      }
    }
  }
  return { row, col };
}

function postReady(g: DensityGrid) {
  const msg: ReadyMessage = {
    type: "ready",
    width: g.width,
    height: g.height,
    minLat: g.minLat,
    maxLat: g.maxLat,
    minLng: g.minLng,
    maxLng: g.maxLng,
    cellSizeKm: g.cellSizeKm,
    population: g.population,
    totalPopulation: g.totalPopulation,
  };
  // Transfer population so we don't double-keep it; we re-fetch through engine if needed.
  // Actually the worker also needs `population` (engine reads grid.population). The engine
  // already has its own reference, so it's safe to NOT transfer (clone instead) and avoid
  // detaching the array the engine still uses.
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

function emitFrame() {
  if (!engine) return;
  const metrics = engine.step();
  const intensity = engine.getIntensity();
  const frame: GridStateMessage = {
    type: "grid",
    day: engine.getDay(),
    intensity,
    metrics,
  };
  (self as DedicatedWorkerGlobalScope).postMessage(frame, [intensity.buffer]);

  if (engine.isFinished()) {
    running = false;
    const done: DoneMessage = {
      type: "done",
      day: engine.getDay(),
      finalAttackRate:
        1 - metrics.S / (metrics.S + metrics.E + metrics.I + metrics.R),
      history: engine.getHistory(),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(done);
  }
}

function scheduleNext() {
  if (!running || !engine) return;
  const intervalMs = Math.max(15, 1000 / speedDaysPerSec);
  pendingFrame = setTimeout(() => {
    emitFrame();
    scheduleNext();
  }, intervalMs);
}

function cancelPending() {
  if (pendingFrame) {
    clearTimeout(pendingFrame);
    pendingFrame = null;
  }
}

self.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "init":
    case "reset": {
      cancelPending();
      running = false;
      grid = buildSyntheticDensity(msg.resolution, msg.targetPopulationMillions);
      // Resolve the seed lng/lat to a populated cell. If the click landed on
      // a sparse/empty cell (sea, mountain), nudge to the nearest populated
      // cell within a small search radius so the initial infections actually
      // take.
      const cell =
        lngLatToCell(grid, msg.seed.lng, msg.seed.lat) ??
        { row: Math.floor(grid.height / 2), col: Math.floor(grid.width / 2) };
      const seed = pickPopulatedCell(grid, cell.row, cell.col);
      engine = new SimEngine(grid, msg.params, seed, msg.rngSeed);
      postReady(grid);
      // Emit initial frame so the UI sees day 0 state.
      const intensity = engine.getIntensity();
      const frame: GridStateMessage = {
        type: "grid",
        day: 0,
        intensity,
        metrics: engine.getHistory()[0],
      };
      (self as DedicatedWorkerGlobalScope).postMessage(frame, [intensity.buffer]);
      break;
    }
    case "run": {
      if (!engine) return;
      speedDaysPerSec = msg.speedDaysPerSec;
      running = true;
      scheduleNext();
      break;
    }
    case "pause": {
      running = false;
      cancelPending();
      break;
    }
    case "step": {
      if (!engine) return;
      const days = Math.max(1, msg.days | 0);
      for (let i = 0; i < days; i++) {
        if (engine.isFinished()) break;
        emitFrame();
      }
      break;
    }
  }
};

export {}; // ensure module
