import "server-only";

export const LAYER_MS = 8000;

export const USER_AGENT = "Frontdoor/0.1 (national place score)";

export function withTimeout<T>(promise: Promise<T>, ms = LAYER_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function fetchJson(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
  ms = LAYER_MS,
): Promise<unknown> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    body: init?.body,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function fetchBytes(url: string, ms = LAYER_MS): Promise<Uint8Array> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
