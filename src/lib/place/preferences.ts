import "server-only";

import { completeText } from "@/lib/meta/client";

import { FACTOR_IDS, sanitizeWeights } from "./score";
import type { FactorId, PlaceMode, Weights } from "./types";

export type ParsedPreferences = {
  office?: string;
  mode?: PlaceMode;
  weights: Weights;
};

function asMode(value: unknown): PlaceMode | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (text === "drive" || text === "driving" || text === "car") return "drive";
  if (text === "bike" || text === "bicycle" || text === "cycling") return "bike";
  if (text === "walk" || text === "walking") return "walk";
  return undefined;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function modeMentioned(mode: PlaceMode, note: string): boolean {
  const hints: Record<PlaceMode, string[]> = {
    drive: ["drive", "driving", "car"],
    bike: ["bike", "bicycle", "cycling", "biking"],
    walk: ["walk", "walking"],
  };
  const haystack = note.toLowerCase();
  return hints[mode].some((hint) => haystack.includes(hint));
}

function officeMentioned(office: string, note: string): boolean {
  const tokens = office
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  const haystack = note.toLowerCase();
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

const WEIGHT_HINTS: Record<FactorId, string[]> = {
  commute: ["commute", "office", "work", "job", "drive", "bike", "walk"],
  schools: ["school"],
  parks: ["park"],
  transit: ["transit", "bus", "train", "subway"],
  highway: ["highway", "freeway", "motorway"],
  noise: ["noise", "quiet", "loud"],
  night: ["night", "dark"],
  daylight: ["daylight", "sun", "sunny"],
  flood: ["flood"],
  crime: ["crime"],
};

function mentionedWeights(note: string, weights: Weights): Weights {
  const haystack = note.toLowerCase();
  const kept: Weights = {};
  for (const id of FACTOR_IDS) {
    const value = weights[id];
    if (value == null) continue;
    if (!WEIGHT_HINTS[id].some((hint) => haystack.includes(hint))) continue;
    kept[id] = value;
  }
  return kept;
}

export async function parsePreferences(note: string | undefined): Promise<ParsedPreferences> {
  const text = note?.trim() ?? "";
  if (!text) return { weights: {} };
  const prompt = [
    "Parse this housing note into JSON only.",
    "Keys: office, mode, weights.",
    "office is a US street address string, or null if the note has no office.",
    "mode is drive, bike, walk, or null.",
    `weights is an object. Keys may only be: ${FACTOR_IDS.join(", ")}.`,
    "Weight values are numbers from 0 to 100. Omit every weight the note does not mention.",
    "Do not invent a key.",
    `Note: ${text.slice(0, 1000)}`,
  ].join("\n");
  try {
    const raw = await completeText(prompt);
    if (raw.startsWith("MOCK ")) return { weights: {} };
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { weights: {} };
    const record = parsed as Record<string, unknown>;
    const office = typeof record.office === "string" ? record.office.trim() : "";
    const weights = mentionedWeights(text, sanitizeWeights(record.weights));
    const mode = asMode(record.mode);
    return {
      office: office.length >= 3 && office.length <= 180 && officeMentioned(office, text) ? office : undefined,
      mode: mode && modeMentioned(mode, text) ? mode : undefined,
      weights,
    };
  } catch {
    return { weights: {} };
  }
}
