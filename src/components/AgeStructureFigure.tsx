"use client";

import { useMemo } from "react";
import {
  M_HOME, M_WORK, M_SCHOOL, M_OTHER,
  THAILAND_AGE_FRACTIONS, AGE_LABELS,
} from "@/data/contact-matrix";

/**
 * Prem-style figure: Thailand age pyramid, four setting heatmaps (Home /
 * Work / School / Other), an "All locations" heatmap, plus a horizontal
 * bar of final attack rate by age band from the most recent sim.
 *
 * All rendered as inline SVG — no chart library, ~250 lines, looks like
 * fig 7 / 8 of the Prem 2021 paper.
 */
export default function AgeStructureFigure({
  ageAttackRates,
  interventions,
}: {
  /** Final attack rate per age band (length 16). Null until a run finishes. */
  ageAttackRates: number[] | null;
  /** Multipliers currently applied to each setting matrix. */
  interventions: { home: number; work: number; school: number; other: number };
}) {
  // Build "all locations" as the weighted sum of the four settings, matching
  // what the engine actually uses.
  const M_ALL_EFF = useMemo(() => {
    const out: number[][] = Array.from({ length: 16 }, () => Array(16).fill(0));
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        out[i][j] =
          interventions.home   * M_HOME[i][j] +
          interventions.work   * M_WORK[i][j] +
          interventions.school * M_SCHOOL[i][j] +
          interventions.other  * M_OTHER[i][j];
      }
    }
    return out;
  }, [interventions]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-200">
      <h3 className="text-base font-semibold mb-3 text-gray-100">
        Thailand — population structure &amp; contact patterns (Prem et al. 2021)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PyramidPanel />
        <HeatmapPanel title="Home"    matrix={M_HOME}   scale={interventions.home}   />
        <HeatmapPanel title="Work"    matrix={M_WORK}   scale={interventions.work}   />
        <HeatmapPanel title="School"  matrix={M_SCHOOL} scale={interventions.school} />
        <HeatmapPanel title="Other"   matrix={M_OTHER}  scale={interventions.other}  />
        <HeatmapPanel title="All (effective)" matrix={M_ALL_EFF} scale={1} />
      </div>
      <div className="mt-4">
        <AgeAttackPanel rates={ageAttackRates} />
      </div>
      <p className="text-[10px] text-gray-500 mt-3 leading-snug">
        Matrices: Prem K, Cook AR &amp; Jit M (2021),
        <em> Projecting contact matrices in 177 geographical regions</em>,
        PLOS Comp Biol 17(7):e1009098. Heatmap entries are mean daily
        contacts an individual of <em>row</em> age has with people of
        <em> column</em> age, scaled by the current intervention slider.
      </p>
    </div>
  );
}

function PyramidPanel() {
  const max = Math.max(...THAILAND_AGE_FRACTIONS);
  return (
    <Panel title="Age pyramid (Thailand)">
      <svg viewBox="0 0 200 220" className="w-full h-44">
        {THAILAND_AGE_FRACTIONS.map((f, i) => {
          const y = 200 - (i + 1) * 11;
          const w = (f / max) * 80;
          // Split evenly (we don't have male/female breakdown handy) —
          // shows two-tone bars for visual parity with the Prem figure.
          return (
            <g key={i}>
              <rect x={100 - w} y={y} width={w} height={9}
                    fill="#60a5fa" opacity={0.85} />
              <rect x={100}     y={y} width={w} height={9}
                    fill="#f87171" opacity={0.85} />
              <text x={2} y={y + 7} fontSize={7} fill="#9ca3af">
                {AGE_LABELS[i]}
              </text>
              <text x={198} y={y + 7} fontSize={7} fill="#9ca3af"
                    textAnchor="end">
                {(f * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}
        <text x={50} y={215} fontSize={7} fill="#9ca3af" textAnchor="middle">
          Male
        </text>
        <text x={150} y={215} fontSize={7} fill="#9ca3af" textAnchor="middle">
          Female
        </text>
      </svg>
    </Panel>
  );
}

function HeatmapPanel({
  title, matrix, scale,
}: { title: string; matrix: number[][]; scale: number }) {
  // Scale the matrix and find max for color normalization.
  const { scaled, max } = useMemo(() => {
    let m = 0;
    const s = matrix.map((row) =>
      row.map((v) => {
        const x = v * scale;
        if (x > m) m = x;
        return x;
      }),
    );
    return { scaled: s, max: m };
  }, [matrix, scale]);

  return (
    <Panel title={title} subtitle={scale !== 1 ? `× ${scale.toFixed(2)}` : undefined}>
      <svg viewBox="0 0 200 200" className="w-full h-44">
        {/* Grid of cells */}
        {scaled.map((row, i) =>
          row.map((v, j) => {
            const intensity = max > 0 ? v / max : 0;
            const color = blueRamp(intensity);
            const x = 20 + j * 11;
            const y = 20 + i * 11;
            return (
              <rect key={`${i}-${j}`} x={x} y={y} width={11} height={11}
                    fill={color} />
            );
          }),
        )}
        {/* Axis ticks every 4 bands */}
        {[0, 4, 8, 12, 15].map((idx) => (
          <g key={`ax-${idx}`}>
            <text x={20 + idx * 11 + 5} y={196} fontSize={7}
                  fill="#9ca3af" textAnchor="middle">
              {ageStartAt(idx)}
            </text>
            <text x={17} y={20 + idx * 11 + 8} fontSize={7}
                  fill="#9ca3af" textAnchor="end">
              {ageStartAt(idx)}
            </text>
          </g>
        ))}
        {/* axis labels */}
        <text x={108} y={205} fontSize={7} fill="#6b7280" textAnchor="middle">
          age of individual
        </text>
        <text x={6} y={108} fontSize={7} fill="#6b7280"
              textAnchor="middle" transform="rotate(-90 6 108)">
          age of contact
        </text>
        <text x={170} y={14} fontSize={6.5} fill="#9ca3af" textAnchor="end">
          max ≈ {max.toFixed(2)}
        </text>
      </svg>
    </Panel>
  );
}

function AgeAttackPanel({ rates }: { rates: number[] | null }) {
  return (
    <Panel title="Final attack rate by age band">
      {rates ? (
        <svg viewBox="0 0 400 110" className="w-full h-28">
          {rates.map((r, i) => {
            const x = 30 + i * 22;
            const h = Math.max(0, Math.min(1, r)) * 80;
            const y = 95 - h;
            const fill = redRamp(Math.min(1, r));
            return (
              <g key={i}>
                <rect x={x} y={y} width={18} height={h} fill={fill} />
                <text x={x + 9} y={y - 2} fontSize={7}
                      fill="#e5e7eb" textAnchor="middle">
                  {(r * 100).toFixed(0)}%
                </text>
                <text x={x + 9} y={105} fontSize={6.5}
                      fill="#9ca3af" textAnchor="middle">
                  {AGE_LABELS[i]}
                </text>
              </g>
            );
          })}
          {/* axis */}
          <line x1={28} y1={15} x2={28} y2={95} stroke="#374151" strokeWidth={0.5} />
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <g key={i}>
              <text x={26} y={95 - t * 80 + 2} fontSize={6.5}
                    fill="#6b7280" textAnchor="end">
                {(t * 100).toFixed(0)}%
              </text>
              <line x1={28} y1={95 - t * 80} x2={400} y2={95 - t * 80}
                    stroke="#1f2937" strokeWidth={0.4} />
            </g>
          ))}
        </svg>
      ) : (
        <div className="text-xs text-gray-500 italic h-28 flex items-center
                        justify-center">
          Run a simulation to see age-specific attack rates here.
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded p-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs font-medium text-gray-200">{title}</div>
        {subtitle && (
          <div className="text-[10px] font-mono text-gray-400">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function ageStartAt(idx: number): string {
  if (idx === 15) return "75+";
  return String(idx * 5);
}

/** White → blue ramp, matching the Prem figures' style. */
function blueRamp(t: number): string {
  // From near-white #f7fbff at t=0 to deep navy #08306b at t=1.
  const stops: [number, [number, number, number]][] = [
    [0.00, [247, 251, 255]],
    [0.20, [222, 235, 247]],
    [0.40, [158, 202, 225]],
    [0.60, [ 66, 146, 198]],
    [0.80, [ 33,  98, 167]],
    [1.00, [  8,  48, 107]],
  ];
  return rampHex(stops, t);
}

function redRamp(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0.00, [ 50,  60,  80]],
    [0.25, [253, 187, 132]],
    [0.50, [252, 141,  89]],
    [0.75, [227,  74,  51]],
    [1.00, [179,   0,   0]],
  ];
  return rampHex(stops, t);
}

function rampHex(
  stops: [number, [number, number, number]][],
  t: number,
): string {
  t = Math.max(0, Math.min(1, t));
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      a = stops[i]; b = stops[i + 1]; break;
    }
  }
  const tt = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * tt);
  const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * tt);
  const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * tt);
  return `rgb(${r},${g},${bl})`;
}
