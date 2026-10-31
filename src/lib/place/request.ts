import type { PlaceMode, PlaceRequest, Weights, FactorId } from "./types";
import { FACTOR_ORDER } from "./factors";

const MODES = new Set<PlaceMode>(["drive", "bike", "walk"]);

export type CompareBody = {
  first: string;
  second: string;
  office?: string;
  mode: PlaceMode;
  weights: Weights;
  note?: string;
};

export function parsePlaceRequest(
  body: unknown,
): { ok: true; value: PlaceRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be an object." };
  }
  const record = body as Record<string, unknown>;
  const address = typeof record.address === "string" ? record.address.trim() : "";
  if (!address) return { ok: false, error: "Address is required." };
  const shared = parseShared(record);
  if (!shared.ok) return shared;
  return {
    ok: true,
    value: {
      address,
      office: shared.office,
      mode: shared.mode,
      weights: shared.weights,
      note: shared.note,
    },
  };
}

export function parseCompareRequest(
  body: unknown,
): { ok: true; value: CompareBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be an object." };
  }
  const record = body as Record<string, unknown>;
  const first = typeof record.first === "string" ? record.first.trim() : "";
  const second = typeof record.second === "string" ? record.second.trim() : "";
  if (!first || !second) return { ok: false, error: "Two addresses are required." };
  const shared = parseShared(record);
  if (!shared.ok) return shared;
  return {
    ok: true,
    value: {
      first,
      second,
      office: shared.office,
      mode: shared.mode,
      weights: shared.weights,
      note: shared.note,
    },
  };
}

function parseShared(record: Record<string, unknown>):
  | { ok: true; office?: string; mode: PlaceMode; weights: Weights; note?: string }
  | { ok: false; error: string } {
  if (typeof record.mode !== "string" || !MODES.has(record.mode as PlaceMode)) {
    return { ok: false, error: "Mode must be drive, bike, or walk." };
  }
  const weights = parseWeights(record.weights);
  if (!weights.ok) return weights;
  const office = typeof record.office === "string" ? record.office.trim() : undefined;
  const note = typeof record.note === "string" ? record.note.trim() : undefined;
  return {
    ok: true,
    office: office || undefined,
    mode: record.mode as PlaceMode,
    weights: weights.value,
    note: note || undefined,
  };
}

function parseWeights(
  value: unknown,
): { ok: true; value: Weights } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Weights must be an object." };
  }
  const weights: Weights = {};
  for (const id of FACTOR_ORDER) {
    const raw = (value as Record<string, unknown>)[id];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, error: `Weight for ${id} must be a number.` };
    }
    weights[id as FactorId] = raw;
  }
  return { ok: true, value: weights };
}
