import { AddressNotFoundError, scoreAddress } from "@/lib/place/engine";
import { parsePreferences } from "@/lib/place/preferences";
import { sanitizeWeights } from "@/lib/place/score";
import type { PlaceMode, Weights } from "@/lib/place/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function asMode(value: unknown): PlaceMode | null {
  if (value === "drive" || value === "bike" || value === "walk") return value;
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON object." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const first = typeof record.first === "string" ? record.first.trim() : "";
  const second = typeof record.second === "string" ? record.second.trim() : "";
  const mode = asMode(record.mode);
  if (!first || !second) {
    return Response.json({ error: "Two addresses are required." }, { status: 400 });
  }
  if (record.mode != null && !mode) {
    return Response.json({ error: "Mode must be drive, bike, or walk." }, { status: 400 });
  }
  const office = typeof record.office === "string" ? record.office.trim() : undefined;
  const note = typeof record.note === "string" ? record.note : undefined;
  const weights: Weights = sanitizeWeights(record.weights);

  try {
    const prefs = note?.trim() ? await parsePreferences(note) : { weights: {} };
    const shared = {
      office: prefs.office ?? (office || undefined),
      mode: prefs.mode ?? mode ?? "drive",
      weights: { ...weights, ...prefs.weights },
    };
    const [firstResult, secondResult] = await Promise.all([
      scoreAddress({ address: first, ...shared }),
      scoreAddress({ address: second, ...shared }),
    ]);
    return Response.json(
      { first: firstResult, second: secondResult },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AddressNotFoundError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return Response.json({ error: "The comparison failed." }, { status: 500 });
  }
}
