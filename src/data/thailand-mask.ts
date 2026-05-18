// Real Thailand boundary loaded from Natural Earth 1:50m country outline.
// Simplified with Douglas-Peucker to ~800 vertices across 20 polygons
// (mainland + 19 islands). Used as an "in-country" mask so the synthetic
// density grid is zero outside Thailand and never overflows into Myanmar,
// Laos, Cambodia, or Malaysia.

import { THAILAND_POLYGONS, THAILAND_BBOX } from "./thailand-polygons";

interface CompiledPolygon {
  coords: number[];   // interleaved [lng, lat, lng, lat, ...]
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

const POLYS: CompiledPolygon[] = THAILAND_POLYGONS.map((coords) => {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    const lng = coords[i];
    const lat = coords[i + 1];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { coords, minLng, maxLng, minLat, maxLat };
});

/**
 * Ray-cast point-in-polygon over an interleaved [lng,lat,...] flat array.
 * Returns true if the point is strictly inside; ties on the edge count as
 * outside, which is fine because cell centers fall on grid lines that
 * don't align with the polygon's vertices.
 */
function pointInFlatPoly(
  lng: number,
  lat: number,
  coords: number[],
): boolean {
  let inside = false;
  const n = coords.length;
  // i is the current vertex, j is the previous vertex.
  let j = n - 2;
  for (let i = 0; i < n; i += 2) {
    const xi = coords[i];
    const yi = coords[i + 1];
    const xj = coords[j];
    const yj = coords[j + 1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

export function isInsideThailand(lng: number, lat: number): boolean {
  // Country bbox short-circuit — fast reject for cells far from Thailand.
  if (
    lng < THAILAND_BBOX.minLng || lng > THAILAND_BBOX.maxLng ||
    lat < THAILAND_BBOX.minLat || lat > THAILAND_BBOX.maxLat
  ) return false;
  for (const p of POLYS) {
    if (
      lng < p.minLng || lng > p.maxLng ||
      lat < p.minLat || lat > p.maxLat
    ) continue;
    if (pointInFlatPoly(lng, lat, p.coords)) return true;
  }
  return false;
}

export function thailandMaskGeoJSON(): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiPolygon",
      coordinates: THAILAND_POLYGONS.map((flat) => {
        const ring: [number, number][] = [];
        for (let i = 0; i < flat.length; i += 2) {
          ring.push([flat[i], flat[i + 1]]);
        }
        return [ring];
      }),
    },
  };
}

export { THAILAND_BBOX };
