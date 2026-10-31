import "server-only";

import { asArray, asNumber, asRecord, asString, fetchJson } from "./http";
import type { PlacePin } from "./types";

export type Located = {
  pin: PlacePin;
  /** Incorporated place or county subdivision, used to pick a police agency. */
  placeName: string;
};

const CENSUS =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

function geographyName(match: Record<string, unknown>, key: string, field: string): string {
  const geos = asRecord(match.geographies);
  const rows = asArray(geos?.[key]);
  const row = asRecord(rows[0]);
  return asString(row?.[field]) ?? "";
}

function fromCensus(payload: unknown): Located | null {
  const result = asRecord(asRecord(payload)?.result);
  const match = asRecord(asArray(result?.addressMatches)[0]);
  if (!match) return null;
  const coordinates = asRecord(match.coordinates);
  const lon = asNumber(coordinates?.x);
  const lat = asNumber(coordinates?.y);
  const label = asString(match.matchedAddress);
  if (lat == null || lon == null || !label) return null;
  if (lat < -15 || lat > 72 || lon < -180 || lon > 180) return null;
  const state = geographyName(match, "States", "STUSAB");
  const county = geographyName(match, "Counties", "NAME");
  const place =
    geographyName(match, "Incorporated Places", "BASENAME") ||
    geographyName(match, "County Subdivisions", "BASENAME");
  if (!state) return null;
  return {
    pin: { lat, lon, label, county, state },
    placeName: place,
  };
}

async function census(address: string): Promise<Located | null> {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const payload = await fetchJson(url);
  return fromCensus(payload);
}

async function nominatimSuggestion(address: string): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  try {
    const payload = await fetchJson(url, undefined, 4000);
    const hit = asRecord(asArray(payload)[0]);
    return asString(hit?.display_name);
  } catch {
    return null;
  }
}

/** Census is the pin. Nominatim may suggest a string when Census has no match. */
export async function geocodeAddress(address: string): Promise<Located | null> {
  const direct = await census(address);
  if (direct) return direct;
  const suggestion = await nominatimSuggestion(address);
  if (!suggestion || suggestion.toLowerCase() === address.trim().toLowerCase()) return null;
  return census(suggestion);
}
