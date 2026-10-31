import type {
  CompareResult,
  PlaceMode,
  PlaceRequest,
  PlaceResult,
  Weights,
} from "@/lib/place/types";

export class ScoreError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ScoreError";
    this.status = status;
  }
}

export type CompareRequest = {
  first: string;
  second: string;
  office?: string;
  mode: PlaceMode;
  weights: Weights;
  note?: string;
};

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function postJson<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  normalize: (value: unknown, status: number) => T,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ScoreError(
      "The score request did not finish. Check the connection and try again.",
      null,
    );
  }

  if (!response.ok) {
    const detail = await readDetail(response);
    const lead =
      response.status === 404
        ? "The score service did not answer (404). This address is still in the search."
        : `The score service returned ${response.status}.`;
    throw new ScoreError(detail ? `${lead} ${detail}` : lead, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ScoreError(
      "The score service returned something this page could not read.",
      response.status,
    );
  }
  return normalize(payload, response.status);
}

async function readDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    try {
      const json = JSON.parse(text) as { error?: unknown; error_description?: unknown };
      if (typeof json.error === "string" && json.error.trim()) return json.error.trim();
      if (typeof json.error_description === "string") return json.error_description.trim();
    } catch {
      return "";
    }
    return "";
  } catch {
    return "";
  }
}

function asPlace(value: unknown, status: number): PlaceResult {
  if (!value || typeof value !== "object") {
    throw new ScoreError(
      "The score service returned something this page could not read.",
      status,
    );
  }
  const record = value as Partial<PlaceResult>;
  const pin = record.pin;
  const lat = Number(pin?.lat);
  const lon = Number(pin?.lon);
  if (!pin || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new ScoreError(
      "The score service returned something this page could not read.",
      status,
    );
  }
  return {
    pin: {
      lat,
      lon,
      label: typeof pin.label === "string" ? pin.label : "",
      county: typeof pin.county === "string" ? pin.county : "",
      state: typeof pin.state === "string" ? pin.state : "",
    },
    factors: Array.isArray(record.factors) ? record.factors : [],
    overall: typeof record.overall === "number" ? record.overall : null,
    brief: typeof record.brief === "string" ? record.brief : "",
    photos: Array.isArray(record.photos) ? record.photos : [],
  };
}

export function fetchPlace(body: PlaceRequest, signal: AbortSignal): Promise<PlaceResult> {
  return postJson("/api/place", body, signal, asPlace);
}

function asCompare(value: unknown, status: number): CompareResult {
  if (!value || typeof value !== "object") {
    throw new ScoreError(
      "The score service returned something this page could not read.",
      status,
    );
  }
  const record = value as Partial<CompareResult>;
  return {
    first: asPlace(record.first, status),
    second: asPlace(record.second, status),
  };
}

export function fetchCompare(body: CompareRequest, signal: AbortSignal): Promise<CompareResult> {
  return postJson("/api/compare", body, signal, asCompare);
}
