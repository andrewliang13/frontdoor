import "server-only";

import {
  distanceToPolygonMeters,
  pointInRing,
  ringArea,
  type LngLat,
} from "./geo";
import { asArray, asNumber, asRecord, fetchJson } from "./http";
import { covered, daylightScore, uncovered } from "./score";
import { southSunHours } from "./sun";
import type { Factor } from "./types";

const QUERY =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query";

type Footprint = {
  ring: LngLat[];
  heightM: number | null;
  area: number;
};

function outerRing(geometry: unknown): LngLat[] {
  const rings = asArray(asRecord(geometry)?.rings);
  const ring = asArray(rings[0]);
  const points: LngLat[] = [];
  for (const pair of ring) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lon = asNumber(pair[0]);
    const lat = asNumber(pair[1]);
    if (lon == null || lat == null) continue;
    points.push({ lon, lat });
  }
  return points;
}

function heightMeters(value: number | null): number | null {
  if (value == null || value < 2 || value > 400) return null;
  return value;
}

async function footprints(lat: number, lon: number): Promise<Footprint[]> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: "100",
    units: "esriSRUnit_Meter",
    outFields: "HEIGHT",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "40",
    f: "json",
  });
  const payload = await fetchJson(`${QUERY}?${params.toString()}`, undefined, 6500);
  const features = asArray(asRecord(payload)?.features);
  const buildings: Footprint[] = [];
  for (const feature of features) {
    const record = asRecord(feature);
    const ring = outerRing(record?.geometry);
    if (ring.length < 3) continue;
    const height = heightMeters(asNumber(asRecord(record?.attributes)?.HEIGHT));
    buildings.push({ ring, heightM: height, area: ringArea(ring) });
  }
  return buildings;
}

export async function daylightFactor(lat: number, lon: number): Promise<Factor> {
  try {
    const buildings = await footprints(lat, lon);
    const containing = buildings.filter((building) => pointInRing(lon, lat, building.ring));
    let subject = containing.sort((a, b) => a.area - b.area)[0] ?? null;
    let snapped = false;
    if (!subject) {
      const nearest = buildings
        .map((building) => ({
          building,
          meters: distanceToPolygonMeters(lat, lon, building.ring),
        }))
        .sort((a, b) => a.meters - b.meters)[0];
      if (nearest && nearest.meters <= 40) {
        subject = nearest.building;
        snapped = true;
      }
    }
    if (!subject) {
      return uncovered(
        "daylight",
        "USA Structures has no building footprint at this point.",
      );
    }
    const neighbors = buildings
      .filter((building) => building !== subject)
      .map((building) => ({
        building,
        meters: distanceToPolygonMeters(lat, lon, building.ring),
      }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 25)
      .map((item) => item.building);
    const sun = southSunHours(
      lat,
      lon,
      subject.ring,
      neighbors.map((building) => ({ ring: building.ring, heightM: building.heightM })),
    );
    if (!sun) {
      return uncovered("daylight", "The building footprint could not be measured.");
    }
    const average = (sun.juneHours + sun.decemberHours) / 2;
    const heightNote = sun.usedRecordedHeight
      ? "the recorded height when present, otherwise 8 m"
      : "8 m unless a height is known";
    const snap = snapped ? "The pin is matched to the nearest footprint within 40 m. " : "";
    const bearings = sun.bearings.map((bearing) => `${bearing}°`).join(", ");
    return covered({
      id: "daylight",
      score: daylightScore(average),
      status: "modeled",
      detail: `${snap}Modeled ${average.toFixed(1)} hours of direct sun on south-facing long sides, averaged for June 21 (${sun.juneHours.toFixed(1)} h) and December 21 (${sun.decemberHours.toFixed(1)} h). Long-side bearings ${bearings}. Assumptions: windows on the long sides, trees ignored, indoor light is modeled. Neighbor footprints are flat shadows at ${heightNote}.`,
    });
  } catch {
    return uncovered("daylight", "USA Structures did not return a footprint.");
  }
}
