import type {
  Factor,
  FactorId,
  FactorStatus,
  PlaceMode,
  PlaceResult,
} from "@/lib/place/types";

export const FACTOR_ORDER: FactorId[] = [
  "commute",
  "schools",
  "parks",
  "transit",
  "daylight",
  "night",
  "highway",
  "noise",
  "flood",
  "crime",
];

export const FACTOR_LABELS: Record<FactorId, string> = {
  commute: "Commute",
  schools: "Schools",
  parks: "Parks",
  transit: "Transit",
  daylight: "Daylight",
  night: "Night light",
  highway: "Highway",
  noise: "Noise",
  flood: "Flood",
  crime: "Crime",
};

export const DEFAULT_WEIGHTS: Record<FactorId, number> = {
  commute: 50,
  schools: 50,
  parks: 50,
  transit: 50,
  daylight: 50,
  night: 50,
  highway: 50,
  noise: 50,
  flood: 50,
  crime: 50,
};

export function modeLabel(mode: PlaceMode): string {
  if (mode === "drive") return "Drive";
  if (mode === "bike") return "Bike";
  return "Walk";
}

export function statusLabel(status: FactorStatus): string {
  if (status === "measured") return "Measured";
  if (status === "modeled") return "Modeled";
  return "Not covered";
}

export function isCovered(factor: Factor): boolean {
  return factor.status !== "not_covered" && factor.score !== null;
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function sourceLine(factor: Factor): string {
  const parts = [
    factor.source?.trim(),
    factor.year ? String(factor.year) : "",
    statusLabel(factor.status),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function alignFactors(factors: Factor[] | undefined): Factor[] {
  const byId = new Map<FactorId, Factor>();
  const extras: Factor[] = [];
  for (const factor of factors ?? []) {
    if (!factor || typeof factor.id !== "string") continue;
    if (FACTOR_ORDER.includes(factor.id)) byId.set(factor.id, factor);
    else extras.push(factor);
  }
  const ordered = FACTOR_ORDER.flatMap((id) => {
    const found = byId.get(id);
    return found ? [found] : [];
  });
  return [...ordered, ...extras];
}

export function gapFactor(id: FactorId): Factor {
  return {
    id,
    label: FACTOR_LABELS[id],
    score: null,
    status: "not_covered",
    detail: "",
    source: "",
  };
}

const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

export function collectGeometry(result: PlaceResult | null): GeoJSON.Feature[] {
  if (!result) return [];
  const features: GeoJSON.Feature[] = [];
  for (const factor of result.factors ?? []) {
    const geometry = (factor as Factor & { geometry?: unknown }).geometry;
    if (!geometry || typeof geometry !== "object") continue;
    const record = geometry as { type?: unknown; coordinates?: unknown };
    if (typeof record.type !== "string" || !GEOMETRY_TYPES.has(record.type)) continue;
    if (record.coordinates == null) continue;
    features.push({
      type: "Feature",
      properties: { id: factor.id },
      geometry: geometry as GeoJSON.Geometry,
    });
  }
  return features;
}
