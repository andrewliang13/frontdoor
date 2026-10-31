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

const CENSUS_POINT =
  "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";

async function census(address: string): Promise<Located | null> {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  try {
    const payload = await fetchJson(url);
    return fromCensus(payload);
  } catch {
    return null;
  }
}

type MapHit = {
  lat: number;
  lon: number;
  /** A short street line Census can accept. The raw display name is too long and returns 400. */
  line: string;
};

function finiteCoord(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : asNumber(value);
  return number != null && Number.isFinite(number) ? number : null;
}

function streetLine(parts: Record<string, unknown> | null): string {
  if (!parts) return "";
  const street = [asString(parts.house_number), asString(parts.road)].filter(Boolean).join(" ");
  const city =
    asString(parts.city) ||
    asString(parts.town) ||
    asString(parts.village) ||
    asString(parts.hamlet) ||
    "";
  const region = asString(parts["ISO3166-2-lvl4"])?.replace(/^US-/i, "") || asString(parts.state) || "";
  const postcode = asString(parts.postcode) ?? "";
  return [street, city, [region, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

async function nominatimHit(address: string): Promise<MapHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  try {
    const payload = await fetchJson(url, undefined, 4000);
    const hit = asRecord(asArray(payload)[0]);
    if (!hit) return null;
    const lat = finiteCoord(hit.lat);
    const lon = finiteCoord(hit.lon);
    const line = streetLine(asRecord(hit.address)) || asString(hit.display_name) || "";
    if (lat == null || lon == null || !line) return null;
    if (lat < -15 || lat > 72 || lon < -180 || lon > 180) return null;
    return { lat, lon, line };
  } catch {
    return null;
  }
}

/** Census street match missed. Keep the map point and read state, county, and place from Census. */
async function censusPoint(hit: MapHit): Promise<Located | null> {
  const url = `${CENSUS_POINT}?x=${hit.lon}&y=${hit.lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  try {
    const payload = await fetchJson(url);
    const result = asRecord(asRecord(payload)?.result);
    const geographies = asRecord(result?.geographies);
    if (!geographies) return null;
    return fromCensus({
      result: {
        addressMatches: [
          {
            matchedAddress: hit.line,
            coordinates: { x: hit.lon, y: hit.lat },
            geographies,
          },
        ],
      },
    });
  } catch {
    return null;
  }
}

/** Census is the pin when it can match the line. A map hit is only the fallback point. */
export async function geocodeAddress(address: string): Promise<Located | null> {
  const direct = await census(address);
  if (direct) return direct;
  const hit = await nominatimHit(address);
  if (!hit) return null;
  if (hit.line.toLowerCase() !== address.trim().toLowerCase()) {
    const retried = await census(hit.line);
    if (retried) return retried;
  }
  return censusPoint(hit);
}
