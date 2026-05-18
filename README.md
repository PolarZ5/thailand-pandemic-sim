# Thailand Pandemic Simulator

Agent-based SEIR pandemic simulator for Thailand, running on real geography.
Population density across the country drives both the local transmission rate
and a gravity-style mobility kernel between cells. The whole simulation runs
in a Web Worker (TypeScript) — no server compute — so the app deploys as a
**static site** on Vercel.

Inspired by Laosiritaworn et al. (2018), *Herd immunity estimation of flu-like
disease spreading in SEIR population: The sociophysics modelling via Monte
Carlo simulation on discrete-spin model* (Siam Physics Congress 2018) —
extended from a uniform 2D Potts lattice to a heterogeneous geographic grid
with mobility.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

## Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel: New Project → import the repo.
3. Vercel auto-detects Next.js — no env vars or config required.
4. Click Deploy. The site is fully pre-rendered: no server-side compute, so
   you stay on the free tier regardless of traffic.

## How it works

- **Population density** is currently *synthetic*: a procedural Thailand
  density field built from city centers + Gaussian falloff. It mimics what a
  resampled mobile-network footprint would look like (Bangkok dominant,
  secondary metros dense, baseline rural density elsewhere).
- **Density abstraction** (`src/data/density.ts`) is the swap point: when
  real HRSL/WorldPop or telco data becomes available, drop in a new
  `DensitySource` implementation. The simulation engine never has to change.
- **Simulation engine** (`src/sim/engine.ts`) runs in a Web Worker:
  - Each cell holds S/E/I/R compartments
  - Local mixing: convex combination of the cell's own infectious fraction
    and a distance-decay-weighted average of neighbours within a 2-cell radius
  - Stochastic exposures via tau-leap Poisson sampling
  - Deterministic E→I and I→R transitions
  - Periodic long-range "commuter" jumps weighted by `pop_i × pop_j` to model
    cross-country travel
- **Rendering**: MapLibre GL + deck.gl `ColumnLayer`s overlay the population
  (greyscale) and infection intensity (red→yellow) on an OpenStreetMap base.
- **Charts**: Recharts area chart shows stacked S/E/I/R % of population over
  time, plus headline metrics (attack rate, R(t)).

## Tunable parameters (UI)

| Parameter | Range | Meaning |
|---|---|---|
| Disease preset | flu / COVID-19 / measles / custom | Bundles R0 + latent + infectious |
| R₀ | 0.5 – 18 | Basic reproduction number |
| Latent period | 1 – 14 days | Time from exposure to becoming infectious |
| Infectious period | 1 – 21 days | Time spent shedding |
| Mobility α | 0.5 – 4 | Distance-decay exponent for between-cell mixing |
| Mobility weight | 0 – 1 | Fraction of contacts that happen outside the home cell |
| Initial infected | 1 – 500 | Number of infected seeded at the seed cell |
| Resolution | 25 km / 5 km / 1 km | Grid size; 5 km is the sweet spot |
| Speed | 1 – 60 days/sec | Wall-clock pacing |

## Project layout

```
src/
├── app/               # Next.js App Router page + layout
├── components/
│   ├── Map.tsx        # MapLibre + deck.gl overlay
│   ├── ControlsPanel.tsx
│   └── SEIRChart.tsx  # Recharts realtime
├── data/
│   ├── density.ts             # DensitySource — swap point for real data
│   ├── thailand-cities.ts     # synthetic seed list
│   └── thailand-mask.ts       # rough country boundary
├── sim/
│   ├── engine.ts      # SEIR + Potts-spin + gravity, all in-worker
│   ├── worker.ts      # Web Worker entry
│   ├── presets.ts     # flu / COVID / measles
│   └── types.ts       # main↔worker message contracts
└── store.ts           # Zustand store
```

## Plugging in real data later

When real HRSL / WorldPop / mobile-network data is available:

1. Preprocess to `Float32Array[width × height]` of population per cell
   (Python script + rasterio works well; output a binary file in `/public`).
2. Create a new `DensitySource` in `src/data/` whose `buildSyntheticDensity`
   equivalent loads the binary instead of generating one.
3. Point the worker (`src/sim/worker.ts`) at the new source.

The engine, UI, and Vercel deployment story all stay the same.
