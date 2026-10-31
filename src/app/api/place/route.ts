import { AddressNotFoundError, scoreAddress } from "@/lib/place/engine";
import { sanitizeWeights } from "@/lib/place/score";
import type { PlaceMode } from "@/lib/place/types";

export const maxDuration = 60;

function asMode(value: unknown): PlaceMode | undefined {
  if (value === "drive" || value === "bike" || value === "walk") return value;
  return undefined;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON object." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const address = typeof record.address === "string" ? record.address.trim() : "";
  if (!address || address.length > 300) {
    return Response.json({ error: "Address is required." }, { status: 400 });
  }
  const office = typeof record.office === "string" ? record.office.trim().slice(0, 300) : undefined;
  const note = typeof record.note === "string" ? record.note.slice(0, 1000) : undefined;
  try {
    const result = await scoreAddress({
      address,
      office: office || undefined,
      mode: asMode(record.mode),
      weights: sanitizeWeights(record.weights),
      note,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof AddressNotFoundError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return Response.json({ error: "The place score could not be completed." }, { status: 500 });
  }
}
