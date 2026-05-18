"use client";

import { useMemo } from "react";
import { useSimStore } from "@/store";
import AgeStructureFigure from "./AgeStructureFigure";

function formatPeople(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return v.toFixed(0);
}

export default function SimSummary({ onReset }: { onReset: () => void }) {
  const finished = useSimStore((s) => s.finished);
  const history = useSimStore((s) => s.history);
  const totalPop = useSimStore((s) => s.gridMeta?.totalPopulation ?? 0);
  const ageAttackRates = useSimStore((s) => s.ageAttackRates);
  const interventions = useSimStore((s) => s.interventions);

  const stats = useMemo(() => {
    if (!finished || history.length === 0) return null;
    const final = history[history.length - 1];
    let peakI = 0, peakIDay = 0;
    let peakNew = 0, peakNewDay = 0;
    let peakRt = 0, peakRtDay = 0;
    for (const p of history) {
      if (p.I > peakI) { peakI = p.I; peakIDay = p.day; }
      if (p.newInfections > peakNew) {
        peakNew = p.newInfections; peakNewDay = p.day;
      }
      if (Number.isFinite(p.Rt) && p.Rt > peakRt) {
        peakRt = p.Rt; peakRtDay = p.day;
      }
    }
    const attackRate =
      totalPop > 0 ? (final.R + final.I + final.E) / totalPop : 0;
    const everInfected = final.R + final.I + final.E;
    return {
      duration: final.day,
      attackRate,
      everInfected,
      neverInfected: final.S,
      peakI, peakIDay,
      peakNew, peakNewDay,
      peakRt, peakRtDay,
    };
  }, [finished, history, totalPop]);

  if (!finished || !stats) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center
                    bg-black/60 backdrop-blur-sm overflow-y-auto py-6
                    pointer-events-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl
                      max-w-4xl w-[95%] p-6 text-gray-200">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-xl font-semibold text-green-400">
            🏁 End of epidemic
          </h3>
          <span className="text-sm text-gray-400 font-mono">
            {stats.duration} days
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          The simulation stopped because there are no more active infections
          (E + I ≈ 0).
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
          <Stat label="Attack rate (total ever infected)"
                value={`${(stats.attackRate * 100).toFixed(1)}%`}
                accent="text-red-300" />
          <Stat label="Total ever infected"
                value={formatPeople(stats.everInfected)} />
          <Stat label="Never infected"
                value={formatPeople(stats.neverInfected)}
                accent="text-blue-300" />
          <Stat label="Peak I (concurrent infections)"
                value={formatPeople(stats.peakI)}
                sub={`day ${stats.peakIDay}`}
                accent="text-orange-300" />
          <Stat label="Peak daily new cases"
                value={formatPeople(stats.peakNew)}
                sub={`day ${stats.peakNewDay}`}
                accent="text-yellow-300" />
          {stats.peakRt > 0 && (
            <Stat label="Peak R(t)"
                  value={stats.peakRt.toFixed(2)}
                  sub={`day ${stats.peakRtDay}`}
                  accent="text-purple-300" />
          )}
        </div>

        <AgeStructureFigure
          ageAttackRates={ageAttackRates}
          interventions={interventions}
        />

        <div className="mt-5 flex gap-2">
          <button
            onClick={onReset}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white
                       rounded py-2 text-sm font-medium transition"
          >
            ↺ Run again
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-gray-800/60 rounded px-3 py-2">
      <div className="text-[11px] text-gray-400 leading-tight">{label}</div>
      <div className={`font-mono text-base mt-0.5 ${accent || "text-gray-100"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500 font-mono">{sub}</div>}
    </div>
  );
}
