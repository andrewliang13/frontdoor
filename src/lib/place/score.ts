import type { Factor, FactorId, FactorStatus, Weights } from "./types";

export const FACTOR_LABELS = {
  commute: "Commute",
  schools: "Schools",
  parks: "Parks",
  transit: "Transit",
  highway: "Highway",
  noise: "Noise",
  night: "Night light",
  daylight: "Daylight",
  flood: "Flood",
  crime: "Crime",
} as const satisfies Record<FactorId, string>;

export const FACTOR_IDS = Object.keys(FACTOR_LABELS) as FactorId[];

export const SOURCES = {
  commute: "OSRM",
  schools: "NCES EDGE",
  parks: "OpenStreetMap",
  transit: "OpenStreetMap",
  highway: "OpenStreetMap",
  noise: "BTS National Transportation Noise Map",
  night: "NASA GIBS VIIRS",
  daylight: "FEMA USA Structures",
  flood: "FEMA NFHL",
  crime: "FBI Crime Data Explorer",
} as const satisfies Record<FactorId, string>;

export const MISS = "This source did not return a result in time.";

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function uncovered(id: FactorId, detail: string): Factor {
  return {
    id,
    label: FACTOR_LABELS[id],
    score: null,
    status: "not_covered",
    detail,
    source: SOURCES[id],
  };
}

export function covered(input: {
  id: FactorId;
  score: number;
  status: Exclude<FactorStatus, "not_covered">;
  detail: string;
  year?: number;
}): Factor {
  return {
    id: input.id,
    label: FACTOR_LABELS[input.id],
    score: clampScore(input.score),
    status: input.status,
    detail: input.detail,
    source: SOURCES[input.id],
    year: input.year,
  };
}

export function formatMiles(miles: number): string {
  const digits = miles < 1 ? 2 : 1;
  return `${miles.toFixed(digits)} miles`;
}

export function commuteScore(minutes: number, mode: "drive" | "bike" | "walk"): number {
  const cap = mode === "walk" ? 30 : mode === "bike" ? 45 : 60;
  return clampScore(100 * (1 - minutes / cap));
}

export function schoolScore(miles: number): number {
  return clampScore(100 * (1 - miles / 2));
}

export function parkScore(nearestMiles: number, withinHalfMile: number): number {
  const distance = clampScore(100 * (1 - nearestMiles / 1));
  const bonus = Math.min(25, withinHalfMile * 8);
  return clampScore(distance * 0.75 + bonus);
}

export function transitScore(miles: number): number {
  return clampScore(100 * (1 - miles / 1));
}

/** Closer to a motorway or trunk scores worse. 1.5 miles and beyond is 100. */
export function highwayScore(miles: number): number {
  return clampScore(100 * Math.min(1, miles / 1.5));
}

/** 45 dB → 100, 80 dB → 0. */
export function noiseScoreFromDb(db: number): number {
  return clampScore((100 * (80 - db)) / 35);
}

/** Brightness 0–255. Darker scores higher. */
export function nightScore(brightness: number): number {
  return clampScore(100 * (1 - brightness / 255));
}

/** Average direct-sun hours. 8 hours → 100. */
export function daylightScore(averageHours: number): number {
  return clampScore((100 * averageHours) / 8);
}

/**
 * Rate is the agency violent-crime rate divided by the national rate.
 * The national rate scores 60. Twice the national rate scores 20.
 */
export function crimeScore(agencyRate: number, nationalRate: number): number {
  if (!(nationalRate > 0)) return 0;
  const ratio = agencyRate / nationalRate;
  return clampScore((100 * (2.5 - ratio)) / 2.5);
}

export function weightFor(weights: Weights, id: FactorId): number {
  const value = weights[id];
  if (value == null) return 1;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function overallScore(factors: Factor[], weights: Weights): number | null {
  let weighted = 0;
  let total = 0;
  for (const factor of factors) {
    if (factor.status === "not_covered" || factor.score == null) continue;
    const weight = weightFor(weights, factor.id);
    if (weight <= 0) continue;
    weighted += factor.score * weight;
    total += weight;
  }
  if (total <= 0) return null;
  return Math.round(weighted / total);
}

export function isFactorId(value: string): value is FactorId {
  return Object.prototype.hasOwnProperty.call(FACTOR_LABELS, value);
}

export function sanitizeWeights(value: unknown): Weights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const weights: Weights = {};
  for (const id of FACTOR_IDS) {
    const raw = record[id];
    const numeric = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    weights[id] = numeric;
  }
  return weights;
}
