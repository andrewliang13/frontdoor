import { angDiff, toLocal, type LngLat, type LocalPoint } from "./geo";

export type NeighborFootprint = {
  ring: LngLat[];
  /** Meters. Null uses the 8 m default. */
  heightM: number | null;
};

export type SunSummary = {
  juneHours: number;
  decemberHours: number;
  bearings: number[];
  usedRecordedHeight: boolean;
  usedDefaultHeight: boolean;
};

type Edge = {
  length: number;
  normalAz: number;
  mid: LocalPoint;
};

const DEFAULT_HEIGHT_M = 8;
const STEP_HOURS = 0.25;

function solarPosition(lat: number, lon: number, year: number, month: number, day: number, hourUtc: number): {
  altitude: number;
  azimuth: number;
} {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    hourUtc / 24 +
    b -
    1524.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const mean = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const mr = (mean * Math.PI) / 180;
  const c =
    Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mr) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mr) * 0.000289;
  const sunLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = sunLong - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);
  const epsilon0 =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos((omega * Math.PI) / 180);
  const dec = Math.asin(
    Math.sin((epsilon * Math.PI) / 180) * Math.sin((lambda * Math.PI) / 180),
  );
  const e = Math.tan(((epsilon * Math.PI) / 180) / 2) ** 2;
  const l0r = (l0 * Math.PI) / 180;
  const eqTime =
    (4 *
      (e * Math.sin(2 * l0r) -
        2 * 0.016708634 * Math.sin(mr) +
        4 * 0.016708634 * e * Math.sin(mr) * Math.cos(2 * l0r) -
        0.5 * e * e * Math.sin(4 * l0r) -
        1.25 * 0.016708634 * 0.016708634 * Math.sin(2 * mr))) /
    (Math.PI / 180);
  let solarMinutes = hourUtc * 60 + eqTime + 4 * lon;
  solarMinutes = ((solarMinutes % 1440) + 1440) % 1440;
  const ha = ((solarMinutes / 4 - 180) * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;
  const altitude = Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  );
  const cosAlt = Math.cos(altitude);
  let azimuth = 0;
  if (Math.abs(cosAlt) > 1e-6) {
    const cosAz =
      (Math.sin(dec) * Math.cos(latR) - Math.cos(dec) * Math.sin(latR) * Math.cos(ha)) / cosAlt;
    azimuth = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
    if (ha > 0) azimuth = 360 - azimuth;
  }
  return { altitude: (altitude * 180) / Math.PI, azimuth };
}

function facadeEdges(lat: number, lon: number, ring: LngLat[]): Edge[] {
  const points = ring.map((point) => toLocal(lat, lon, point.lat, point.lon));
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.5) points.pop();
  }
  if (points.length < 3) return [];
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  const ccw = area > 0;
  const edges: Edge[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;
    const nx = ccw ? dy : -dy;
    const ny = ccw ? -dx : dx;
    const nlen = Math.hypot(nx, ny) || 1;
    const east = nx / nlen;
    const north = ny / nlen;
    const normalAz = (Math.atan2(east, north) * 180) / Math.PI;
    edges.push({
      length,
      normalAz: (normalAz + 360) % 360,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    });
  }
  return edges;
}

function neighborPolys(lat: number, lon: number, neighbors: NeighborFootprint[]): { points: LocalPoint[]; height: number; recorded: boolean }[] {
  return neighbors
    .map((neighbor) => {
      const points = neighbor.ring.map((point) => toLocal(lat, lon, point.lat, point.lon));
      if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 0.5) points.pop();
      }
      if (points.length < 3) return null;
      const recorded = neighbor.heightM != null && neighbor.heightM >= 2;
      return {
        points,
        height: recorded ? Math.min(neighbor.heightM as number, 120) : DEFAULT_HEIGHT_M,
        recorded,
      };
    })
    .filter((item): item is { points: LocalPoint[]; height: number; recorded: boolean } => item != null);
}

function shaded(
  mid: LocalPoint,
  azimuth: number,
  altitude: number,
  neighbors: { points: LocalPoint[]; height: number }[],
): boolean {
  const alt = (altitude * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const reach = Math.min(150, Math.max(1, 1 / Math.tan(alt)));
  const end = {
    x: mid.x + Math.sin(az) * reach,
    y: mid.y + Math.cos(az) * reach,
  };
  for (const neighbor of neighbors) {
    const shadow = Math.min(150, neighbor.height / Math.tan(alt));
    const limit = shadow / reach;
    const pts = neighbor.points;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const hit = segmentT(mid.x, mid.y, end.x, end.y, a.x, a.y, b.x, b.y);
      if (hit != null && hit > 0.02 && hit <= limit) return true;
    }
  }
  return false;
}

function segmentT(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-8) return null;
  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (u < 0 || u > 1) return null;
  return t;
}

function hoursOn(
  lat: number,
  lon: number,
  month: number,
  day: number,
  facades: Edge[],
  neighbors: { points: LocalPoint[]; height: number }[],
): number {
  let total = 0;
  for (const facade of facades) {
    let lit = 0;
    for (let hour = 0; hour < 24; hour += STEP_HOURS) {
      const sun = solarPosition(lat, lon, 2026, month, day, hour);
      if (sun.altitude <= 2) continue;
      if (angDiff(sun.azimuth, facade.normalAz) >= 90) continue;
      if (shaded(facade.mid, sun.azimuth, sun.altitude, neighbors)) continue;
      lit += 1;
    }
    total += lit * STEP_HOURS;
  }
  return facades.length ? total / facades.length : 0;
}

/** Hours of direct sun on the south-facing long sides, June 21 and December 21. */
export function southSunHours(lat: number, lon: number, ring: LngLat[], neighbors: NeighborFootprint[]): SunSummary | null {
  const edges = facadeEdges(lat, lon, ring);
  if (edges.length === 0) return null;
  const longest = edges.reduce((max, edge) => Math.max(max, edge.length), 0);
  const longSides = edges.filter((edge) => edge.length >= longest * 0.65);
  const pool = longSides.length ? longSides : edges;
  let south = pool.filter((edge) => angDiff(edge.normalAz, 180) <= 75);
  if (south.length === 0) {
    const closest = [...pool].sort((a, b) => angDiff(a.normalAz, 180) - angDiff(b.normalAz, 180))[0];
    south = closest ? [closest] : [];
  }
  if (south.length === 0) return null;
  const polys = neighborPolys(lat, lon, neighbors);
  return {
    juneHours: hoursOn(lat, lon, 6, 21, south, polys),
    decemberHours: hoursOn(lat, lon, 12, 21, south, polys),
    bearings: south.map((edge) => Math.round(edge.normalAz)),
    usedRecordedHeight: polys.some((item) => item.recorded),
    usedDefaultHeight: polys.some((item) => !item.recorded) || polys.length === 0,
  };
}
