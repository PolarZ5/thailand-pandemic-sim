"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSimStore } from "@/store";
import { PRESET_LABELS, type PresetId } from "@/sim/presets";
import type { Resolution } from "@/data/density";

interface ControlsPanelProps {
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

function HelpTip({ text }: { text: string }) {
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hover || !iconRef.current) {
      setPos(null);
      return;
    }
    const recompute = () => {
      const r = iconRef.current!.getBoundingClientRect();
      const W = 256; // tooltip width (w-64)
      // Prefer floating above-right of the icon. Clamp horizontally to
      // viewport with an 8px gutter so the box never spills off-screen.
      let left = r.left;
      const maxLeft = window.innerWidth - W - 8;
      if (left > maxLeft) left = maxLeft;
      if (left < 8) left = 8;
      setPos({ top: r.top - 6, left });
    };
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [hover]);

  return (
    <>
      <span
        ref={iconRef}
        className="ml-1 cursor-help text-gray-500 hover:text-gray-300
                   text-[10px] leading-none select-none"
        aria-label={text}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        tabIndex={0}
      >
        ⓘ
      </span>
      {hover && pos !== null && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: "translateY(-100%)",
                width: 256,
                zIndex: 1000,
              }}
              className="bg-gray-800 border border-gray-700 text-[11px]
                         leading-snug text-gray-100 rounded px-2 py-1.5
                         shadow-lg pointer-events-none whitespace-normal"
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function FieldLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span>{children}</span>
      {tip && <HelpTip text={tip} />}
    </span>
  );
}

function Slider({
  label, value, min, max, step, onChange, suffix, tip,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string; tip?: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-gray-300 mb-1">
        <FieldLabel tip={tip}>{label}</FieldLabel>
        <span className="font-mono">
          {value.toFixed(step < 1 ? 2 : 0)}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

export default function ControlsPanel({
  onStart, onPause, onReset, onStep,
}: ControlsPanelProps) {
  const preset = useSimStore((s) => s.preset);
  const params = useSimStore((s) => s.params);
  const resolution = useSimStore((s) => s.resolution);
  const speed = useSimStore((s) => s.speedDaysPerSec);
  const running = useSimStore((s) => s.running);
  const finished = useSimStore((s) => s.finished);
  const day = useSimStore((s) => s.day);
  const seed = useSimStore((s) => s.seed);
  const viz = useSimStore((s) => s.viz);
  const targetPop = useSimStore((s) => s.targetPopulationMillions);
  const interventions = useSimStore((s) => s.interventions);
  const setPreset = useSimStore((s) => s.setPreset);
  const updateParam = useSimStore((s) => s.updateParam);
  const setResolution = useSimStore((s) => s.setResolution);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const updateViz = useSimStore((s) => s.updateViz);
  const setTargetPopulationMillions = useSimStore(
    (s) => s.setTargetPopulationMillions,
  );
  const updateIntervention = useSimStore((s) => s.updateIntervention);
  const resetInterventions = useSimStore((s) => s.resetInterventions);

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 border-l border-gray-800 overflow-y-auto h-full">
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-semibold">Thailand Pandemic Sim</h2>
          <a
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            How to use ↗
          </a>
        </div>
        <p className="text-xs text-gray-400">
          Click on the map to set a seed point, then press ▶ Play.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-300 flex items-baseline">
          <FieldLabel tip="Bundles R₀, latent period and infectious period. Switching to Custom unlocks all sliders.">
            Disease preset
          </FieldLabel>
        </label>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as PresetId)}
          className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
        >
          {(Object.keys(PRESET_LABELS) as PresetId[]).map((k) => (
            <option key={k} value={k}>
              {PRESET_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-300 flex items-baseline">
          <FieldLabel tip="Cell size of the simulation grid. 25 km is fastest (~1.5k cells), 1 km is most detailed (~940k cells) but much slower. Disabled while a sim is running.">
            Grid resolution
          </FieldLabel>
        </label>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as Resolution)}
          className="w-full bg-gray-800 rounded px-2 py-1 text-sm"
          disabled={running}
        >
          <option value="25km">25 km (fastest)</option>
          <option value="5km">5 km (balanced)</option>
          <option value="1km">1 km (detailed, slow)</option>
        </select>
      </div>

      <div>
        <Slider
          label="Total population"
          value={targetPop}
          min={5} max={150} step={1}
          onChange={(v) => setTargetPopulationMillions(v)}
          suffix=" M"
          tip="Rescales the synthetic density so the country sums to this total (in millions). Relative city concentrations stay the same. Thailand is ≈ 70 M in real life."
        />
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <Slider
          label="R₀ (basic reproduction number)"
          value={params.r0}
          min={0.5} max={18} step={0.1}
          onChange={(v) => updateParam("r0", v)}
          tip="Basic reproduction number — average secondary infections per case in a fully susceptible population. Drives β internally via β = R₀ / infectious_period."
        />
        <Slider
          label="Latent period"
          value={params.latentDays}
          min={1} max={14} step={1}
          onChange={(v) => updateParam("latentDays", v)}
          suffix=" d"
          tip="Mean number of days from exposure (E) to becoming infectious (I)."
        />
        <Slider
          label="Infectious period"
          value={params.infectiousDays}
          min={1} max={21} step={1}
          onChange={(v) => updateParam("infectiousDays", v)}
          suffix=" d"
          tip="Mean number of days an agent is infectious (I) before recovery (R)."
        />
        <Slider
          label="Mobility α (distance decay)"
          value={params.mobilityAlpha}
          min={0.5} max={4} step={0.1}
          onChange={(v) => updateParam("mobilityAlpha", v)}
          tip="Distance-decay exponent for the gravity-style mixing kernel between cells. Higher α means infection stays more local; lower α spreads it farther per tick."
        />
        <Slider
          label="Mobility weight (non-local mixing)"
          value={params.mobilityWeight}
          min={0} max={1} step={0.05}
          onChange={(v) => updateParam("mobilityWeight", v)}
          tip="Fraction of contact pressure that comes from neighbouring cells vs. the home cell. 0 = fully local, 1 = fully non-local."
        />
        <Slider
          label="Initial infected at seed"
          value={params.initialInfected}
          min={1} max={500} step={1}
          onChange={(v) => updateParam("initialInfected", v)}
          suffix=" people"
          tip="Number of agents placed in the I state in the seed cell at day 0."
        />
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            Interventions (Prem et al. matrices)
          </div>
          <button
            onClick={resetInterventions}
            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
          >
            reset
          </button>
        </div>
        <Slider
          label="Home contact multiplier"
          value={interventions.home}
          min={0} max={1.5} step={0.05}
          onChange={(v) => updateIntervention("home", v)}
          tip="Scales the household contact matrix M_home. 1.0 = normal life; 0 = households fully isolate from each other."
        />
        <Slider
          label="Work contact multiplier"
          value={interventions.work}
          min={0} max={1.5} step={0.05}
          onChange={(v) => updateIntervention("work", v)}
          tip="Scales the workplace matrix M_work. 0.5 ≈ WFH for half the workforce; 0 = full work-from-home / shutdown."
        />
        <Slider
          label="School contact multiplier"
          value={interventions.school}
          min={0} max={1.5} step={0.05}
          onChange={(v) => updateIntervention("school", v)}
          tip="Scales the school matrix M_school. 0 = full school closure; 0.5 ≈ alternating cohorts."
        />
        <Slider
          label="Other-locations multiplier"
          value={interventions.other}
          min={0} max={1.5} step={0.05}
          onChange={(v) => updateIntervention("other", v)}
          tip="Scales the M_other matrix (transport, shops, leisure). 0 ≈ hard lockdown; 1 = baseline."
        />
        <p className="text-[10px] text-gray-500 leading-snug">
          R₀ is held at the slider value by recalibrating q against the
          dominant eigenvalue of the effective contact matrix.
        </p>
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          Map visualization
        </div>
        <Slider
          label="Density layer alpha"
          value={viz.densityAlpha}
          min={0} max={1} step={0.05}
          onChange={(v) => updateViz("densityAlpha", v)}
          tip="Opacity of the population-density (viridis) layer on the map. 0 hides it; 1 is fully opaque."
        />
        <Slider
          label="Density saturation (people/cell)"
          value={viz.densityMax}
          min={500} max={80000} step={500}
          onChange={(v) => updateViz("densityMax", v)}
          tip="Population value at which the density color ramp tops out at yellow. Lower this to make secondary cities pop; raise it to keep Bangkok from washing everything else out."
        />
        <Slider
          label="Infection layer alpha"
          value={viz.infectionAlpha}
          min={0} max={1} step={0.05}
          onChange={(v) => updateViz("infectionAlpha", v)}
          tip="Opacity of the infection-intensity (red→yellow) overlay."
        />
        <Slider
          label="Infection saturation (I/pop)"
          value={viz.infectionMax * 100}
          min={1} max={50} step={1}
          onChange={(v) => updateViz("infectionMax", v / 100)}
          suffix=" %"
          tip="Fraction of a cell that must be currently infected before the infection ramp saturates to its brightest color. Lower it to spot the early front; raise it to focus on peak outbreaks."
        />
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <Slider
          label="Speed (days / real sec)"
          value={speed}
          min={1} max={60} step={1}
          onChange={setSpeed}
          suffix=" d/s"
          tip="Wall-clock pacing — how many simulated days the worker steps per real second."
        />
        <div className="text-xs text-gray-400 flex items-baseline">
          <FieldLabel tip="Where Patient 0 is seeded. Click anywhere on Thailand to move it. Clicks outside the country are rejected.">
            Seed point:
          </FieldLabel>
          <span className="ml-1">
            {seed
              ? <span className="font-mono">
                  {seed.lat.toFixed(3)}, {seed.lng.toFixed(3)}
                </span>
              : <span className="text-yellow-400">click on the map</span>}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {!running ? (
            <button
              onClick={onStart}
              disabled={!seed || finished}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-700
                         disabled:text-gray-400 text-white rounded py-2 text-sm
                         font-medium transition"
            >
              ▶ {finished ? "Epidemic ended" : day === 0 ? "Start" : "Resume"}
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black
                         rounded py-2 text-sm font-medium transition"
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={onStep}
            disabled={running || finished || !seed}
            className="bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900
                       disabled:text-gray-600 text-white px-3 py-2 rounded
                       text-sm transition"
            title="ก้าวทีละวัน"
          >
            Step
          </button>
          <button
            onClick={onReset}
            className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2
                       rounded text-sm transition"
          >
            ↺ Reset
          </button>
        </div>
        <div className="text-sm text-gray-300">
          Day: <span className="font-mono text-base">{day}</span>
          {finished && (
            <span className="ml-2 text-green-400">— end of epidemic</span>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-3 mt-auto text-[11px] leading-snug text-gray-500">
        <div className="font-medium text-gray-400 mb-1">
          Model adapted from
        </div>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            <a
              href="https://iopscience.iop.org/article/10.1088/1742-6596/1144/1/012041"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Laosiritaworn, Laosiritaworn &amp; Laosiritaworn (2018)
            </a>
            , <em>Herd immunity estimation of flu-like disease spreading in
            SEIR population: The sociophysics modelling via Monte Carlo
            simulation on discrete-spin model</em>, J. Phys.: Conf. Ser. 1144
            012041.{" "}
            <a
              href="https://doi.org/10.1088/1742-6596/1144/1/012041"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              doi:10.1088/1742-6596/1144/1/012041
            </a>
          </li>
          <li>
            <a
              href="https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1009098"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Prem, Cook &amp; Jit (2021)
            </a>
            , <em>Projecting contact matrices in 177 geographical regions: an
            update and comparison with empirical data for the COVID-19
            era</em>, PLOS Comp Biol 17(7):e1009098.{" "}
            <a
              href="https://doi.org/10.1371/journal.pcbi.1009098"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              doi:10.1371/journal.pcbi.1009098
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
