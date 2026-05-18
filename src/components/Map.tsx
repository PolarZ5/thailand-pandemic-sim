"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useSimStore } from "@/store";
import { isInsideThailand } from "@/data/thailand-mask";

const KM_PER_DEG_LAT = 111.32;
function kmPerDegLng(lat: number) {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

interface CellRow {
  position: [number, number];
  population: number;
  intensity: number;
}

// 5-stop viridis-like ramp on log(population). Exported so the ColorBar
// component renders the same gradient.
export const POP_STOPS: [number, [number, number, number]][] = [
  [0.00, [ 30,   0,  60]],
  [0.25, [ 60,  20, 140]],
  [0.50, [ 30, 130, 180]],
  [0.75, [ 90, 200, 120]],
  [1.00, [253, 231,  60]],
];

// 3-stop ramp red → orange → yellow for infection intensity.
export const INF_STOPS: [number, [number, number, number]][] = [
  [0.00, [180,   0,   0]],
  [0.50, [255, 120,   0]],
  [1.00, [255, 240, 140]],
];

function rampColor(
  stops: [number, [number, number, number]][],
  v: number,
): [number, number, number] {
  v = Math.max(0, Math.min(1, v));
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i][0] && v <= stops[i + 1][0]) {
      a = stops[i]; b = stops[i + 1]; break;
    }
  }
  const t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
  return [
    Math.round(a[1][0] + (b[1][0] - a[1][0]) * t),
    Math.round(a[1][1] + (b[1][1] - a[1][1]) * t),
    Math.round(a[1][2] + (b[1][2] - a[1][2]) * t),
  ];
}

export function popColor(
  pop: number,
  alpha: number,
  maxPop: number,
): [number, number, number, number] {
  const denom = Math.log10(1 + maxPop) || 1;
  const v = Math.min(1, Math.log10(1 + Math.max(0, pop)) / denom);
  const [r, g, b] = rampColor(POP_STOPS, v);
  return [r, g, b, Math.round(alpha * 255)];
}

export function infectionColor(
  intensity: number,
  alpha: number,
  maxIntensity: number,
): [number, number, number, number] {
  if (intensity <= 0) return [0, 0, 0, 0];
  const v = Math.min(1, intensity / Math.max(1e-9, maxIntensity));
  const [r, g, b] = rampColor(INF_STOPS, v);
  // Fade in alpha for very low intensities so neighbours aren't totally hidden.
  const aLow = 0.25;
  const fade = aLow + (1 - aLow) * v;
  return [r, g, b, Math.round(alpha * fade * 255)];
}

export default function Map() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<MapboxOverlay | null>(null);
  // "Seed must be inside Thailand" — shown briefly when the user clicks
  // outside the country boundary.
  const [seedWarning, setSeedWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gridMeta = useSimStore((s) => s.gridMeta);
  const intensity = useSimStore((s) => s.intensity);
  const seed = useSimStore((s) => s.seed);
  const setSeed = useSimStore((s) => s.setSeed);
  const viz = useSimStore((s) => s.viz);

  // Per-cell rows (precomputed once per gridMeta).
  const cellRows = useMemo<CellRow[]>(() => {
    if (!gridMeta) return [];
    const { width, height, minLat, minLng, cellSizeKm, population } = gridMeta;
    const cellSizeDegLat = cellSizeKm / KM_PER_DEG_LAT;
    const midLat = (gridMeta.minLat + gridMeta.maxLat) / 2;
    const cellSizeDegLng = cellSizeKm / kmPerDegLng(midLat);
    const rows: CellRow[] = [];
    for (let row = 0; row < height; row++) {
      const lat = minLat + (row + 0.5) * cellSizeDegLat;
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        const pop = population[idx];
        if (pop < 5) continue;
        const lng = minLng + (col + 0.5) * cellSizeDegLng;
        rows.push({ position: [lng, lat], population: pop, intensity: 0 });
      }
    }
    return rows;
  }, [gridMeta]);

  // Update intensity values into cellRows (mutation OK; we trigger redraw
  // via updateTriggers).
  const intensityVersion = useMemo(() => {
    if (!gridMeta || !intensity || cellRows.length === 0) return 0;
    const { width, minLat, minLng, cellSizeKm } = gridMeta;
    const cellSizeDegLat = cellSizeKm / KM_PER_DEG_LAT;
    const midLat = (gridMeta.minLat + gridMeta.maxLat) / 2;
    const cellSizeDegLng = cellSizeKm / kmPerDegLng(midLat);
    for (const r of cellRows) {
      const col = Math.floor((r.position[0] - minLng) / cellSizeDegLng);
      const row = Math.floor((r.position[1] - minLat) / cellSizeDegLat);
      r.intensity = intensity[row * width + col] || 0;
    }
    return Date.now();
  }, [gridMeta, intensity, cellRows]);

  // --- Init MapLibre + Deck once ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [101.0, 13.5],
      zoom: 5.2,
      minZoom: 4,
      maxZoom: 11,
    });
    mapRef.current = map;

    // Mount deck.gl as a MapLibre IControl — it reuses MapLibre's GL context
    // and viewport, so resize and projection are handled for us.
    // interleaved: true reuses MapLibre's GL context, so no separate canvas
    // is created and resize is handled by MapLibre.
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    map.addControl(overlay as unknown as maplibregl.IControl);
    deckRef.current = overlay;

    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      if (!isInsideThailand(lng, lat)) {
        setSeedWarning(
          "Seed must be inside Thailand — click on land within the border.",
        );
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(
          () => setSeedWarning(null),
          2500,
        );
        return;
      }
      setSeed({ lng, lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      deckRef.current = null;
    };
  }, [setSeed]);

  // --- Push layers whenever data changes ---
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || !gridMeta) return;

    const radiusM = (gridMeta.cellSizeKm * 1000) / 2;

    const populationLayer = new ColumnLayer<CellRow>({
      id: "pop",
      data: cellRows,
      diskResolution: 4,
      radius: radiusM,
      extruded: false,
      pickable: false,
      getPosition: (d) => d.position,
      getFillColor: (d) => popColor(d.population, viz.densityAlpha, viz.densityMax),
      updateTriggers: {
        getFillColor: `${viz.densityAlpha}|${viz.densityMax}`,
      },
    });

    const infectionLayer = new ColumnLayer<CellRow>({
      id: "inf",
      data: cellRows,
      diskResolution: 4,
      radius: radiusM,
      extruded: false,
      pickable: false,
      getPosition: (d) => d.position,
      getFillColor: (d) =>
        infectionColor(d.intensity, viz.infectionAlpha, viz.infectionMax),
      updateTriggers: {
        getFillColor: `${intensityVersion}|${viz.infectionAlpha}|${viz.infectionMax}`,
      },
    });

    const seedLayer = seed
      ? new ScatterplotLayer({
          id: "seed",
          data: [seed],
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 7,
          radiusUnits: "pixels",
          getFillColor: [255, 255, 0, 255],
          stroked: true,
          getLineColor: [0, 0, 0, 255],
          lineWidthMinPixels: 2,
        })
      : null;

    const layers = [populationLayer, infectionLayer];
    if (seedLayer) layers.push(seedLayer as unknown as ColumnLayer<CellRow>);
    deck.setProps({ layers });
  }, [gridMeta, cellRows, intensityVersion, seed, viz]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ background: "#0b0f17" }}
    >
      {seedWarning && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30
                     bg-yellow-500/90 text-black text-xs font-medium
                     px-3 py-2 rounded shadow-lg pointer-events-none"
          role="status"
        >
          {seedWarning}
        </div>
      )}
    </div>
  );
}
