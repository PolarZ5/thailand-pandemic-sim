"use client";

import { useSimStore } from "@/store";
import { PRESET_LABELS, type PresetId } from "@/sim/presets";
import type { Resolution } from "@/data/density";

interface ControlsPanelProps {
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

function Slider({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-gray-300 mb-1">
        <span>{label}</span>
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
  const setPreset = useSimStore((s) => s.setPreset);
  const updateParam = useSimStore((s) => s.updateParam);
  const setResolution = useSimStore((s) => s.setResolution);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const updateViz = useSimStore((s) => s.updateViz);

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 border-l border-gray-800 overflow-y-auto h-full">
      <div>
        <h2 className="text-lg font-semibold mb-1">Thailand Pandemic Sim</h2>
        <p className="text-xs text-gray-400">
          Click on the map to set a seed point, then press ▶ Play.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-300">Disease preset</label>
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
        <label className="text-xs text-gray-300">Grid resolution</label>
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

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <Slider
          label="R₀ (basic reproduction number)"
          value={params.r0}
          min={0.5} max={18} step={0.1}
          onChange={(v) => updateParam("r0", v)}
        />
        <Slider
          label="Latent period"
          value={params.latentDays}
          min={1} max={14} step={1}
          onChange={(v) => updateParam("latentDays", v)}
          suffix=" d"
        />
        <Slider
          label="Infectious period"
          value={params.infectiousDays}
          min={1} max={21} step={1}
          onChange={(v) => updateParam("infectiousDays", v)}
          suffix=" d"
        />
        <Slider
          label="Mobility α (distance decay)"
          value={params.mobilityAlpha}
          min={0.5} max={4} step={0.1}
          onChange={(v) => updateParam("mobilityAlpha", v)}
        />
        <Slider
          label="Mobility weight (non-local mixing)"
          value={params.mobilityWeight}
          min={0} max={1} step={0.05}
          onChange={(v) => updateParam("mobilityWeight", v)}
        />
        <Slider
          label="Initial infected at seed"
          value={params.initialInfected}
          min={1} max={500} step={1}
          onChange={(v) => updateParam("initialInfected", v)}
          suffix=" people"
        />
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
        />
        <Slider
          label="Density saturation (people/cell)"
          value={viz.densityMax}
          min={500} max={80000} step={500}
          onChange={(v) => updateViz("densityMax", v)}
        />
        <Slider
          label="Infection layer alpha"
          value={viz.infectionAlpha}
          min={0} max={1} step={0.05}
          onChange={(v) => updateViz("infectionAlpha", v)}
        />
        <Slider
          label="Infection saturation (I/pop)"
          value={viz.infectionMax * 100}
          min={1} max={50} step={1}
          onChange={(v) => updateViz("infectionMax", v / 100)}
          suffix=" %"
        />
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <Slider
          label="Speed (days / real sec)"
          value={speed}
          min={1} max={60} step={1}
          onChange={setSpeed}
          suffix=" d/s"
        />
        <div className="text-xs text-gray-400">
          Seed point:{" "}
          {seed
            ? <span className="font-mono">
                {seed.lat.toFixed(3)}, {seed.lng.toFixed(3)}
              </span>
            : <span className="text-yellow-400">click on the map</span>}
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
        Model adapted from{" "}
        <a
          href="https://iopscience.iop.org/article/10.1088/1742-6596/1144/1/012041"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Laosiritaworn, Laosiritaworn &amp; Laosiritaworn (2018)
        </a>
        , <em>Herd immunity estimation of flu-like disease spreading in SEIR
        population: The sociophysics modelling via Monte Carlo simulation on
        discrete-spin model</em>, J. Phys.: Conf. Ser. 1144 012041.{" "}
        <a
          href="https://doi.org/10.1088/1742-6596/1144/1/012041"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          doi:10.1088/1742-6596/1144/1/012041
        </a>
      </div>
    </div>
  );
}
