// DensitySource abstraction. Today: synthetic Thailand density built from
// known city centers + Gaussian falloff. Tomorrow (when telco data is
// available): drop in a new implementation that satisfies the same interface,
// and nothing in the simulation engine has to change.

import {
  THAILAND_CITIES,
  RURAL_BASELINE_DENSITY,
} from "./thailand-cities";
import { isInsideThailand, THAILAND_BBOX } from "./thailand-mask";

export type Resolution = "1km" | "5km" | "25km";

export interface DensityGrid {
  resolution: Resolution;
  cellSizeKm: number;
  width: number;   // cols (lng direction)
  height: number;  // rows (lat direction)
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  // population per cell, row-major, [row * width + col]
  population: Float32Array;
  totalPopulation: number;
}

const KM_PER_DEG_LAT = 111.32;
function kmPerDegLng(lat: number) {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

const RES_TO_KM: Record<Resolution, number> = {
  "25km": 25,
  "5km": 5,
  "1km": 1,
};

/**
 * Build a synthetic population-density grid for Thailand at the requested
 * resolution. Each cell holds an estimated headcount (people in that cell).
 *
 * Method:
 *   density(r) = sum over cities of  P_i * gaussian(r, sigma_i) / (2π σ²_i)
 *              + rural baseline (only inside the country mask)
 *   population(cell) = density(cell_center) * cellAreaKm²
 *   then uniformly scale so the total matches `targetTotalMillions * 1e6`
 *
 * This isn't real census data, but it captures the qualitative shape:
 * Bangkok is overwhelmingly dense, secondary cities form moderate hotspots,
 * and rural areas have a thin baseline. That's enough to drive realistic
 * spreading dynamics.
 */
export function buildSyntheticDensity(
  resolution: Resolution,
  targetTotalMillions?: number,
): DensityGrid {
  const cellSizeKm = RES_TO_KM[resolution];
  const { minLat, maxLat, minLng, maxLng } = THAILAND_BBOX;

  // Use the bbox's midpoint to pick a uniform deg-per-km step that's
  // accurate enough across Thailand's modest latitude range.
  const midLat = (minLat + maxLat) / 2;
  const cellSizeDegLat = cellSizeKm / KM_PER_DEG_LAT;
  const cellSizeDegLng = cellSizeKm / kmPerDegLng(midLat);

  const height = Math.ceil((maxLat - minLat) / cellSizeDegLat);
  const width = Math.ceil((maxLng - minLng) / cellSizeDegLng);

  const population = new Float32Array(width * height);
  const cellAreaKm2 = cellSizeKm * cellSizeKm;
  let totalPopulation = 0;

  // Pre-square sigmas for speed (in km).
  const cities = THAILAND_CITIES.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    pop: c.population,
    twoSigmaSq: 2 * c.sigmaKm * c.sigmaKm,
    norm: 1 / (2 * Math.PI * c.sigmaKm * c.sigmaKm), // gaussian normaliser
  }));

  for (let row = 0; row < height; row++) {
    const lat = minLat + (row + 0.5) * cellSizeDegLat;
    const kmPerDegLngLocal = kmPerDegLng(lat);
    for (let col = 0; col < width; col++) {
      const lng = minLng + (col + 0.5) * cellSizeDegLng;
      if (!isInsideThailand(lng, lat)) continue;

      let densityPerKm2 = RURAL_BASELINE_DENSITY;

      for (const c of cities) {
        const dxKm = (lng - c.lng) * kmPerDegLngLocal;
        const dyKm = (lat - c.lat) * KM_PER_DEG_LAT;
        const r2 = dxKm * dxKm + dyKm * dyKm;
        densityPerKm2 += c.pop * c.norm * Math.exp(-r2 / c.twoSigmaSq);
      }

      const pop = densityPerKm2 * cellAreaKm2;
      population[row * width + col] = pop;
      totalPopulation += pop;
    }
  }

  // Scale the whole grid so the country total matches the user-picked
  // target. This preserves the *shape* of the density (relative city
  // concentrations stay the same) and only shifts the absolute headcount.
  if (
    targetTotalMillions !== undefined &&
    targetTotalMillions > 0 &&
    totalPopulation > 0
  ) {
    const target = targetTotalMillions * 1e6;
    const scale = target / totalPopulation;
    for (let i = 0; i < population.length; i++) population[i] *= scale;
    totalPopulation = target;
  }

  return {
    resolution,
    cellSizeKm,
    width,
    height,
    minLat,
    maxLat,
    minLng,
    maxLng,
    population,
    totalPopulation,
  };
}

/** Convert a grid cell (row,col) to its center [lng, lat]. */
export function cellToLngLat(
  grid: Pick<
    DensityGrid,
    "minLat" | "minLng" | "cellSizeKm" | "width" | "height"
  >,
  row: number,
  col: number,
): [number, number] {
  const midLat = (grid.minLat + grid.minLat + (grid.height * grid.cellSizeKm) / KM_PER_DEG_LAT) / 2;
  const cellSizeDegLat = grid.cellSizeKm / KM_PER_DEG_LAT;
  const cellSizeDegLng = grid.cellSizeKm / kmPerDegLng(midLat);
  const lat = grid.minLat + (row + 0.5) * cellSizeDegLat;
  const lng = grid.minLng + (col + 0.5) * cellSizeDegLng;
  return [lng, lat];
}

/** Find the cell that contains a lng/lat, or null if outside the grid. */
export function lngLatToCell(
  grid: DensityGrid,
  lng: number,
  lat: number,
): { row: number; col: number } | null {
  if (lat < grid.minLat || lat > grid.maxLat) return null;
  if (lng < grid.minLng || lng > grid.maxLng) return null;
  const midLat = (grid.minLat + grid.maxLat) / 2;
  const cellSizeDegLat = grid.cellSizeKm / KM_PER_DEG_LAT;
  const cellSizeDegLng = grid.cellSizeKm / kmPerDegLng(midLat);
  const row = Math.floor((lat - grid.minLat) / cellSizeDegLat);
  const col = Math.floor((lng - grid.minLng) / cellSizeDegLng);
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) return null;
  return { row, col };
}
