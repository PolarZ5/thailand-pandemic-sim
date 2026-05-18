"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import ControlsPanel from "@/components/ControlsPanel";
import SEIRChart from "@/components/SEIRChart";
import SimSummary from "@/components/SimSummary";
import ColorBar from "@/components/ColorBar";
import { useSimStore } from "@/store";
import type { WorkerOutbound, WorkerInbound } from "@/sim/types";

// Map uses browser-only APIs (maplibre-gl) — load client-side.
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

function ColorBarsOverlay() {
  const viz = useSimStore((s) => s.viz);
  return (
    <div className="absolute bottom-3 left-3 flex flex-col gap-2">
      <ColorBar variant="density"   max={viz.densityMax}   alpha={viz.densityAlpha} />
      <ColorBar variant="infection" max={viz.infectionMax} alpha={viz.infectionAlpha} />
    </div>
  );
}

export default function Page() {
  const workerRef = useRef<Worker | null>(null);
  const store = useSimStore;

  // Spawn worker once.
  useEffect(() => {
    const worker = new Worker(
      new URL("../sim/worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
      const msg = ev.data;
      const s = store.getState();
      if (msg.type === "ready") {
        s.setGridMeta({
          width: msg.width,
          height: msg.height,
          minLat: msg.minLat,
          maxLat: msg.maxLat,
          minLng: msg.minLng,
          maxLng: msg.maxLng,
          cellSizeKm: msg.cellSizeKm,
          population: msg.population,
          totalPopulation: msg.totalPopulation,
        });
        s.resetHistory();
      } else if (msg.type === "grid") {
        s.applyFrame(msg.day, msg.intensity, msg.metrics);
      } else if (msg.type === "done") {
        s.setFinished(msg.history);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [store]);

  const post = useCallback((msg: WorkerInbound) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const initSim = useCallback(() => {
    const s = store.getState();
    if (!s.seed) return;
    s.resetHistory();
    post({
      type: "init",
      resolution: s.resolution,
      params: s.params,
      seed: { lng: s.seed.lng, lat: s.seed.lat },
      targetPopulationMillions: s.targetPopulationMillions,
    });
  }, [post, store]);

  // Init on mount, and re-init whenever resolution or target pop changes
  // (worker rebuilds + rescales the grid).
  const resolution = useSimStore((s) => s.resolution);
  const targetPop = useSimStore((s) => s.targetPopulationMillions);
  useEffect(() => {
    initSim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution, targetPop]);

  // Re-init when the seed point moves (only if not running).
  const seed = useSimStore((s) => s.seed);
  const running = useSimStore((s) => s.running);
  useEffect(() => {
    if (running || !seed) return;
    initSim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const onStart = useCallback(() => {
    const s = store.getState();
    useSimStore.setState({ running: true, finished: false });
    post({ type: "run", speedDaysPerSec: s.speedDaysPerSec });
  }, [post, store]);

  const onPause = useCallback(() => {
    useSimStore.setState({ running: false });
    post({ type: "pause" });
  }, [post]);

  const onStep = useCallback(() => {
    post({ type: "step", days: 1 });
  }, [post]);

  const onReset = useCallback(() => {
    const s = store.getState();
    useSimStore.setState({ running: false, finished: false });
    if (!s.seed) return;
    initSim();
  }, [initSim, store]);

  return (
    <div className="grid h-screen w-screen"
         style={{ gridTemplateColumns: "1fr 340px", gridTemplateRows: "1fr 240px" }}>
      <div className="row-span-1 col-span-1 relative">
        <Map />
        <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur
                        rounded px-3 py-2 text-xs text-gray-200 max-w-md">
          <div className="font-semibold mb-0.5">Thailand Pandemic Simulator</div>
          <div className="text-gray-400">
            Purple → yellow = population density (proxy for mobile-network density)
            <br />
            Red / orange = current infection intensity per cell
            <br />
            Click a dense area (green / yellow) to set the seed point
          </div>
        </div>
        <ColorBarsOverlay />
        <SimSummary onReset={onReset} />
      </div>
      <div className="row-span-2 col-span-1 min-w-0">
        <ControlsPanel
          onStart={onStart}
          onPause={onPause}
          onReset={onReset}
          onStep={onStep}
        />
      </div>
      <div className="row-span-1 col-span-1 min-w-0">
        <SEIRChart />
      </div>
    </div>
  );
}
