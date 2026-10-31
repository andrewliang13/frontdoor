import "server-only";

import { asArray, asRecord, asString, fetchJson } from "./http";
import { clampScore, covered, uncovered } from "./score";
import type { Factor } from "./types";

const ZONES =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
const AVAILABILITY =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/0/query";

const SFHA = new Set(["A", "AE", "AH", "AO", "AR", "A99", "V", "VE"]);

type Zone = { code: string; subtype: string; sfha: boolean };

function pointQuery(url: string, lat: number, lon: number, fields: string): string {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
    returnGeometry: "false",
    f: "json",
  });
  return `${url}?${params.toString()}`;
}

function scoreZone(zone: Zone): number {
  if (zone.code === "V" || zone.code === "VE") return 8;
  if (zone.sfha || SFHA.has(zone.code)) return 22;
  if (/0\.2/.test(zone.subtype)) return 68;
  if (zone.code === "X" || zone.code === "B" || zone.code === "C") return 90;
  return 50;
}

function describe(zone: Zone): string {
  if (zone.code === "D") {
    return "Zone D, flood hazard undetermined. Unmapped is not a pass.";
  }
  if (zone.sfha || SFHA.has(zone.code)) {
    return `Zone ${zone.code}, a special flood hazard. Special flood hazard scores low.`;
  }
  if (/0\.2/.test(zone.subtype)) {
    return `Zone ${zone.code}, a 0.2 percent annual chance area, outside the special flood hazard.`;
  }
  const subtype = zone.subtype ? `, ${zone.subtype.toLowerCase()}` : "";
  return `Zone ${zone.code}${subtype}. Outside the special flood hazard.`;
}

export async function floodFactor(lat: number, lon: number): Promise<Factor> {
  try {
    const payload = await fetchJson(pointQuery(ZONES, lat, lon, "FLD_ZONE,ZONE_SUBTY,SFHA_TF"));
    const features = asArray(asRecord(payload)?.features);
    const zones: Zone[] = [];
    for (const feature of features) {
      const attributes = asRecord(asRecord(feature)?.attributes);
      const code = (asString(attributes?.FLD_ZONE) ?? "").toUpperCase();
      if (!code) continue;
      zones.push({
        code,
        subtype: asString(attributes?.ZONE_SUBTY) ?? "",
        sfha: asString(attributes?.SFHA_TF)?.toUpperCase() === "T",
      });
    }
    if (zones.length === 0) {
      const coverage = await fetchJson(pointQuery(AVAILABILITY, lat, lon, "STUDY_ID"));
      const mapped = asArray(asRecord(coverage)?.features).length > 0;
      if (!mapped) {
        return uncovered(
          "flood",
          "FEMA has not mapped this point. Unmapped is not a pass.",
        );
      }
      return covered({
        id: "flood",
        score: 90,
        status: "measured",
        detail:
          "FEMA has mapped this area and returned no special flood hazard at the point. Outside a mapped hazard.",
      });
    }
    const undetermined = zones.find((zone) => zone.code === "D");
    if (undetermined && zones.length === 1) {
      return uncovered("flood", describe(undetermined));
    }
    const ranked = zones
      .filter((zone) => zone.code !== "D")
      .map((zone) => ({ zone, score: scoreZone(zone) }))
      .sort((a, b) => a.score - b.score);
    const worst = ranked[0];
    if (!worst) {
      return uncovered("flood", "Zone D, flood hazard undetermined. Unmapped is not a pass.");
    }
    return covered({
      id: "flood",
      score: clampScore(worst.score),
      status: "measured",
      detail: describe(worst.zone),
    });
  } catch {
    return uncovered("flood", "The National Flood Hazard Layer did not return a zone.");
  }
}
