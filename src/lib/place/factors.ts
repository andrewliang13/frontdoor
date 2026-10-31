import type { Factor, FactorId, FactorStatus, Weights } from "./types";

export const LAYER_TIMEOUT_MS = 8_000;

export const FACTOR_LABEL: Record<FactorId, string> = {
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
};

export const FACTOR_ORDER: FactorId[] = [
  "commute",
  "schools",
  "parks",
  "transit",
  "highway",
  "noise",
  "night",
  "daylight",
  "flood",
  "crime",
];

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function coveredFactor(
  id: FactorId,
  score: number,
  status: Exclude<FactorStatus, "not_covered">,
  detail: string,
  source: string,
  year?: number,
): Factor {
  return {
    id,
    label: FACTOR_LABEL[id],
    score: clampScore(score),
    status,
    detail,
    source,
    ...(year === undefined ? {} : { year }),
  };
}

export function uncovered(id: FactorId, detail: string, source: string): Factor {
  return {
    id,
    label: FACTOR_LABEL[id],
    score: null,
    status: "not_covered",
    detail,
    source,
  };
}

export function overallScore(factors: Factor[], weights: Weights): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const factor of factors) {
    if (factor.status === "not_covered" || factor.score === null) continue;
    const raw = weights[factor.id];
    const weight = typeof raw === "number" && Number.isFinite(raw) ? raw : 1;
    if (weight <= 0) continue;
    weighted += factor.score * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return null;
  return Math.round(weighted / weightSum);
}

export function orderFactors(factors: Factor[]): Factor[] {
  const byId = new Map(factors.map((factor) => [factor.id, factor]));
  return FACTOR_ORDER.flatMap((id) => {
    const factor = byId.get(id);
    return factor ? [factor] : [];
  });
}

export async function settleFactor(
  id: FactorId,
  source: string,
  work: () => Promise<Factor>,
): Promise<Factor> {
  try {
    return await work();
  } catch {
    return uncovered(id, "This layer did not return.", source);
  }
}
