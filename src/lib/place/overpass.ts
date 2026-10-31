import "server-only";

import {
  distanceToPolygonMeters,
  distanceToPolylineMeters,
  milesBetween,
  pointInRing,
  type LngLat,
} from "./geo";
import { asArray, asNumber, asRecord, asString, fetchJson } from "./http";
import {
  covered,
  formatMiles,
  highwayScore,
  parkScore,
  transitScore,
  uncovered,
} from "./score";
import type { Factor } from "./types";

const HOSTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const HALF_MILE_M = 804.672;

type OsmElement = {
  type: string;
  lat?: number;
  lon?: number;
  tags: Record<string, string>;
  geometry: LngLat[];
};

export type OsmBundle = {
  parks: Factor;
  transit: Factor;
  highway: Factor;
  highwayMiles: number | null;
};

function lineOf(element: OsmElement): LngLat[] {
  if (element.geometry.length >= 2) return element.geometry;
  if (element.lat != null && element.lon != null) return [{ lat: element.lat, lon: element.lon }];
  return [];
}

function parseElements(payload: unknown): OsmElement[] {
  const elements = asArray(asRecord(payload)?.elements);
  const parsed: OsmElement[] = [];
  for (const item of elements) {
    const record = asRecord(item);
    if (!record) continue;
    const tagsRecord = asRecord(record.tags);
    const tags: Record<string, string> = {};
    if (tagsRecord) {
      for (const [key, value] of Object.entries(tagsRecord)) {
        if (typeof value === "string") tags[key] = value;
      }
    }
    const geometry = asArray(record.geometry)
      .map((point) => {
        const row = asRecord(point);
        const lat = asNumber(row?.lat);
        const lon = asNumber(row?.lon);
        return lat == null || lon == null ? null : { lat, lon };
      })
      .filter((point): point is LngLat => point != null);
    parsed.push({
      type: asString(record.type) ?? "",
      lat: asNumber(record.lat) ?? undefined,
      lon: asNumber(record.lon) ?? undefined,
      tags,
      geometry,
    });
  }
  return parsed;
}

async function query(lat: number, lon: number): Promise<OsmElement[]> {
  const body = `[out:json][timeout:7];
(
  node["highway"="bus_stop"](around:1400,${lat},${lon});
  node["railway"~"^(station|halt|tram_stop|stop|subway_entrance)$"](around:1400,${lat},${lon});
  way["leisure"="park"](around:1400,${lat},${lon});
  way["highway"~"^(motorway|trunk)$"](around:2000,${lat},${lon});
);
out tags geom;`;
  let last: unknown;
  for (const host of HOSTS) {
    try {
      const payload = await fetchJson(
        host,
        { method: "POST", body, headers: { "Content-Type": "text/plain" } },
        7500,
      );
      return parseElements(payload);
    } catch (error) {
      last = error;
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") break;
    }
  }
  throw last instanceof Error ? last : new Error("overpass failed");
}

function parksFactor(lat: number, lon: number, elements: OsmElement[]): Factor {
  const parks = elements.filter((element) => element.tags.leisure === "park" && element.type === "way");
  const distances = parks
    .map((park) => {
      const line = lineOf(park);
      if (line.length < 2) return null;
      const meters = pointInRing(lon, lat, line) ? 0 : distanceToPolygonMeters(lat, lon, line);
      return meters / 1609.344;
    })
    .filter((miles): miles is number => miles != null && Number.isFinite(miles));
  if (distances.length === 0) {
    return covered({
      id: "parks",
      score: 0,
      status: "measured",
      detail: "No park within 0.87 miles.",
    });
  }
  const nearest = Math.min(...distances);
  const within = distances.filter((miles) => miles * 1609.344 <= HALF_MILE_M).length;
  return covered({
    id: "parks",
    score: parkScore(nearest, within),
    status: "measured",
    detail: `${formatMiles(nearest)} to the nearest park. ${within} parks within half a mile.`,
  });
}

function transitFactor(lat: number, lon: number, elements: OsmElement[]): Factor {
  const stops = elements.filter((element) => {
    if (element.type !== "node" || element.lat == null || element.lon == null) return false;
    return element.tags.highway === "bus_stop" || element.tags.railway != null;
  });
  if (stops.length === 0) {
    return covered({
      id: "transit",
      score: 0,
      status: "measured",
      detail:
        "No rail or bus stop within 0.87 miles. This is the distance to a stop, not a transit itinerary.",
    });
  }
  const nearest = Math.min(
    ...stops.map((stop) => milesBetween(lat, lon, stop.lat as number, stop.lon as number)),
  );
  return covered({
    id: "transit",
    score: transitScore(nearest),
    status: "measured",
    detail: `${formatMiles(nearest)} in a straight line to the nearest rail or bus stop. This is the walk to the stop, not a transit itinerary.`,
  });
}

function highwayFactor(lat: number, lon: number, elements: OsmElement[]): { factor: Factor; miles: number } {
  const roads = elements.filter((element) => {
    const kind = element.tags.highway;
    return element.type === "way" && (kind === "motorway" || kind === "trunk");
  });
  const distances = roads
    .map((road) => {
      const line = lineOf(road);
      if (line.length < 2) return null;
      return distanceToPolylineMeters(lat, lon, line) / 1609.344;
    })
    .filter((miles): miles is number => miles != null && Number.isFinite(miles));
  if (distances.length === 0) {
    const miles = 2000 / 1609.344;
    return {
      miles,
      factor: covered({
        id: "highway",
        score: highwayScore(miles),
        status: "measured",
        detail: "No motorway or trunk within 1.2 miles. Closer scores worse.",
      }),
    };
  }
  const miles = Math.min(...distances);
  return {
    miles,
    factor: covered({
      id: "highway",
      score: highwayScore(miles),
      status: "measured",
      detail: `${formatMiles(miles)} to the nearest motorway or trunk. Closer scores worse.`,
    }),
  };
}

export async function osmFactors(lat: number, lon: number): Promise<OsmBundle> {
  try {
    const elements = await query(lat, lon);
    const highway = highwayFactor(lat, lon, elements);
    return {
      parks: parksFactor(lat, lon, elements),
      transit: transitFactor(lat, lon, elements),
      highway: highway.factor,
      highwayMiles: highway.miles,
    };
  } catch {
    return {
      parks: uncovered("parks", "OpenStreetMap did not return parks."),
      transit: uncovered("transit", "OpenStreetMap did not return stops."),
      highway: uncovered("highway", "OpenStreetMap did not return roads."),
      highwayMiles: null,
    };
  }
}
