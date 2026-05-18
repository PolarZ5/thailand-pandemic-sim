"use client";

import { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { useSimStore } from "@/store";

function formatPeople(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "k";
  return v.toFixed(0);
}

interface Point {
  day: number;
  S: number;
  E: number;
  I: number;
  R: number;
  newInfections: number;
}

export default function SEIRChart() {
  const history = useSimStore((s) => s.history);
  const latest = useSimStore((s) => s.latestMetrics);
  const totalPop = useSimStore((s) => s.gridMeta?.totalPopulation ?? 0);

  // Downsample history to ~400 points if it grows long; the chart stays
  // fluid even after thousands of simulated days.
  const data: Point[] = useMemo(() => {
    if (history.length <= 400) return history;
    const stride = Math.ceil(history.length / 400);
    const out: Point[] = [];
    for (let i = 0; i < history.length; i += stride) out.push(history[i]);
    if (out[out.length - 1] !== history[history.length - 1]) {
      out.push(history[history.length - 1]);
    }
    return out;
  }, [history]);

  const attackRate = useMemo(() => {
    if (!latest || totalPop === 0) return 0;
    return (latest.R + latest.I + latest.E) / totalPop;
  }, [latest, totalPop]);

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 border-t border-gray-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2
                      text-xs text-gray-300 border-b border-gray-800">
        <span>
          Pop: <span className="font-mono">{formatPeople(totalPop)}</span>
        </span>
        {latest && (
          <>
            <span className="text-blue-300">
              S: <span className="font-mono">{formatPeople(latest.S)}</span>
            </span>
            <span className="text-yellow-300">
              E: <span className="font-mono">{formatPeople(latest.E)}</span>
            </span>
            <span className="text-red-300">
              I: <span className="font-mono">{formatPeople(latest.I)}</span>
            </span>
            <span className="text-green-300">
              R: <span className="font-mono">{formatPeople(latest.R)}</span>
            </span>
            <span className="text-orange-300">
              New infections / day:{" "}
              <span className="font-mono">
                {formatPeople(latest.newInfections)}
              </span>
            </span>
            <span className="text-pink-300">
              Currently infected:{" "}
              <span className="font-mono">
                {formatPeople(latest.I)}
              </span>
            </span>
            <span className="text-gray-400">
              Attack rate:{" "}
              <span className="font-mono">
                {(attackRate * 100).toFixed(1)}%
              </span>
            </span>
            {Number.isFinite(latest.Rt) && (
              <span className="text-purple-300">
                R(t): <span className="font-mono">{latest.Rt.toFixed(2)}</span>
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 56, left: 0, bottom: 8 }}
            stackOffset="expand"
          >
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              dataKey="day"
              stroke="#6b7280"
              fontSize={11}
              label={{
                value: "day", position: "insideBottomRight", offset: -2,
                fill: "#6b7280", fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="frac"
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              stroke="#6b7280" fontSize={11}
              domain={[0, 1]}
            />
            <YAxis
              yAxisId="cnt"
              orientation="right"
              tickFormatter={(v) => formatPeople(v as number)}
              stroke="#9ca3af" fontSize={11}
            />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #374151",
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => {
                if (name === "newInfections" || name === "infectedLine") {
                  return [formatPeople(v as number), name === "newInfections"
                    ? "New infections / day" : "Currently infected"];
                }
                return [formatPeople(v as number), name];
              }}
              labelFormatter={(d) => `day ${d}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {/* Stacked SEIR areas on left fractional axis. */}
            <Area yAxisId="frac" type="monotone" dataKey="S" stackId="1"
                  name="Susceptible" stroke="#60a5fa" fill="#3b82f6" />
            <Area yAxisId="frac" type="monotone" dataKey="E" stackId="1"
                  name="Exposed" stroke="#fbbf24" fill="#f59e0b" />
            <Area yAxisId="frac" type="monotone" dataKey="I" stackId="1"
                  name="Infected" stroke="#f87171" fill="#ef4444" />
            <Area yAxisId="frac" type="monotone" dataKey="R" stackId="1"
                  name="Recovered" stroke="#4ade80" fill="#22c55e" />

            {/* Raw-count lines on right counts axis. */}
            <Line yAxisId="cnt" type="monotone" dataKey="newInfections"
                  name="New infections / day" stroke="#fb923c" strokeWidth={2}
                  dot={false} isAnimationActive={false} />
            <Line yAxisId="cnt" type="monotone" dataKey="I"
                  name="Currently infected" stroke="#ec4899" strokeWidth={2}
                  strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
