export type LngLat = { lon: number; lat: number };

export type LocalPoint = { x: number; y: number };

const EARTH_MILES = 3958.7613;

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function toLocal(originLat: number, originLon: number, lat: number, lon: number): LocalPoint {
  const cos = Math.cos((originLat * Math.PI) / 180);
  return {
    x: (lon - originLon) * 111320 * cos,
    y: (lat - originLat) * 110540,
  };
}

export function pointInRing(lon: number, lat: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const yj = ring[j].lat;
    const xi = ring[i].lon;
    const xj = ring[j].lon;
    const crosses = yi > lat !== yj > lat;
    if (!crosses) continue;
    const xAtLat = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lon < xAtLat) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function openLine(points: LngLat[]): LngLat[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.lon - last.lon) < 1e-10 && Math.abs(first.lat - last.lat) < 1e-10) {
    return points.slice(0, -1);
  }
  return points;
}

export function distanceToPolylineMeters(lat: number, lon: number, line: LngLat[]): number {
  if (line.length === 0) return Infinity;
  const locals = line.map((point) => toLocal(lat, lon, point.lat, point.lon));
  if (locals.length === 1) return Math.hypot(locals[0].x, locals[0].y);
  let best = Infinity;
  for (let i = 0; i < locals.length - 1; i += 1) {
    const a = locals[i];
    const b = locals[i + 1];
    best = Math.min(best, distancePointToSegment(0, 0, a.x, a.y, b.x, b.y));
  }
  return best;
}

export function distanceToPolygonMeters(lat: number, lon: number, ring: LngLat[]): number {
  if (pointInRing(lon, lat, ring)) return 0;
  const line = openLine(ring);
  if (line.length < 2) return distanceToPolylineMeters(lat, lon, ring);
  const closed = line.length > 2 ? [...line, line[0]] : line;
  return distanceToPolylineMeters(lat, lon, closed);
}

export function ringArea(ring: LngLat[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.lon * b.lat - b.lon * a.lat;
  }
  return Math.abs(sum / 2);
}

/** Web Mercator tile index used by GIBS and the BTS noise cache. */
export function webMercatorTile(
  lat: number,
  lon: number,
  zoom: number,
): { row: number; col: number; px: number; py: number } {
  const origin = 20037508.342787;
  const resolution = 156543.03392800014 / 2 ** zoom;
  const radius = 6378137;
  const mx = radius * ((lon * Math.PI) / 180);
  const my = radius * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
  const colF = (mx + origin) / (256 * resolution);
  const rowF = (origin - my) / (256 * resolution);
  const col = Math.floor(colF);
  const row = Math.floor(rowF);
  return {
    row,
    col,
    px: Math.min(255, Math.max(0, Math.floor((colF - col) * 256))),
    py: Math.min(255, Math.max(0, Math.floor((rowF - row) * 256))),
  };
}

export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
