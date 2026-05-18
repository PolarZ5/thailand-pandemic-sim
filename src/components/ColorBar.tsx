"use client";

import { useMemo } from "react";
import { POP_STOPS, INF_STOPS } from "./Map";

interface ColorBarProps {
  variant: "density" | "infection";
  /** Saturation value at the right end of the bar. */
  max: number;
  /** Alpha applied to the gradient (matches the layer's alpha). */
  alpha: number;
}

function stopsToGradientCss(
  stops: [number, [number, number, number]][],
  alpha: number,
) {
  return stops
    .map(([p, [r, g, b]]) => `rgba(${r},${g},${b},${alpha}) ${p * 100}%`)
    .join(", ");
}

function formatPop(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}
function formatInf(v: number): string {
  if (v >= 0.01) return `${(v * 100).toFixed(1)}%`;
  return `${(v * 100).toFixed(2)}%`;
}

export default function ColorBar({ variant, max, alpha }: ColorBarProps) {
  const { gradientCss, label, ticks } = useMemo(() => {
    if (variant === "density") {
      // Log-spaced ticks so the viridis ramp's log scale reads correctly.
      const logMax = Math.log10(1 + max);
      const tickFracs = [0, 0.25, 0.5, 0.75, 1];
      const ticks = tickFracs.map((t) => {
        const v = Math.pow(10, t * logMax) - 1;
        return { t, label: formatPop(Math.max(0, v)) };
      });
      return {
        gradientCss: stopsToGradientCss(POP_STOPS, alpha),
        label: "Population density (people / cell)",
        ticks,
      };
    }
    const tickFracs = [0, 0.25, 0.5, 0.75, 1];
    const ticks = tickFracs.map((t) => ({
      t,
      label: formatInf(t * max),
    }));
    return {
      gradientCss: stopsToGradientCss(INF_STOPS, alpha),
      label: "Infected fraction in cell (I / pop)",
      ticks,
    };
  }, [variant, max, alpha]);

  return (
    <div className="bg-gray-900/85 backdrop-blur rounded px-3 py-2 text-[10px]
                    text-gray-200 w-[220px] pointer-events-none">
      <div className="font-medium leading-tight mb-1">{label}</div>
      <div
        className="h-2 rounded"
        style={{ background: `linear-gradient(to right, ${gradientCss})` }}
      />
      <div className="relative mt-0.5 h-3 text-gray-300 font-mono">
        {ticks.map((tk, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2"
            style={{ left: `${tk.t * 100}%` }}
          >
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  );
}
