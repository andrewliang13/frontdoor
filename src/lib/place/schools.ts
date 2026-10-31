import "server-only";

import { milesBetween } from "./geo";
import { asArray, asNumber, asRecord, asString, fetchJson } from "./http";
import { covered, formatMiles, schoolScore, uncovered } from "./score";
import type { Factor } from "./types";

const QUERY =
  "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0/query";

type School = { name: string; miles: number; year: number };

async function schoolsWithin(lat: number, lon: number, miles: number): Promise<School[]> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(miles),
    units: "esriSRUnit_StatuteMile",
    outFields: "NAME,LAT,LON,SCHOOLYEAR",
    returnGeometry: "false",
    resultRecordCount: "2000",
    f: "json",
  });
  const payload = await fetchJson(`${QUERY}?${params.toString()}`);
  const features = asArray(asRecord(payload)?.features);
  const schools: School[] = [];
  for (const feature of features) {
    const attributes = asRecord(asRecord(feature)?.attributes);
    const name = asString(attributes?.NAME);
    const schoolLat = asNumber(attributes?.LAT);
    const schoolLon = asNumber(attributes?.LON);
    if (!name || schoolLat == null || schoolLon == null) continue;
    const yearText = asString(attributes?.SCHOOLYEAR) ?? "";
    const yearMatch = /(\d{4})\s*$/.exec(yearText);
    schools.push({
      name,
      miles: milesBetween(lat, lon, schoolLat, schoolLon),
      year: yearMatch ? Number(yearMatch[1]) : 2025,
    });
  }
  schools.sort((a, b) => a.miles - b.miles);
  return schools;
}

export async function schoolsFactor(lat: number, lon: number): Promise<Factor> {
  try {
    const nearby = await schoolsWithin(lat, lon, 8);
    if (nearby.length === 0) {
      return covered({
        id: "schools",
        score: 0,
        status: "measured",
        year: 2025,
        detail:
          "No public school point within 8 miles. Distance only, not a rating and not an attendance zone.",
      });
    }
    const nearest = nearby[0];
    const names = nearby.slice(0, 3).map((school) => school.name).join(", ");
    return covered({
      id: "schools",
      score: schoolScore(nearest.miles),
      status: "measured",
      year: nearest.year,
      detail: `${formatMiles(nearest.miles)} to the nearest public school. Closest: ${names}. Distance only, not a rating and not an attendance zone.`,
    });
  } catch {
    return uncovered("schools", "NCES EDGE did not return school points.");
  }
}
