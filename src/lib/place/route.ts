import "server-only";

import { asArray, asNumber, asRecord, fetchJson } from "./http";
import { geocodeAddress } from "./geocode";
import { commuteScore, covered, formatMiles, uncovered } from "./score";
import type { Factor, PlaceMode } from "./types";

const PROFILES: Record<PlaceMode, string> = {
  drive: "driving",
  bike: "bike",
  walk: "foot",
};

export async function commuteFactor(input: {
  lat: number;
  lon: number;
  office?: string;
  mode: PlaceMode;
}): Promise<Factor> {
  const office = input.office?.trim() ?? "";
  if (!office) {
    return uncovered("commute", "Add an office address to score the commute.");
  }
  try {
    const located = await geocodeAddress(office);
    if (!located) {
      return uncovered("commute", "Census could not match the office address.");
    }
    const profile = PROFILES[input.mode];
    const url = `https://router.project-osrm.org/route/v1/${profile}/${input.lon},${input.lat};${located.pin.lon},${located.pin.lat}?overview=false`;
    const root = asRecord(await fetchJson(url));
    if (root?.code !== "Ok") {
      return uncovered("commute", "The route could not be measured.");
    }
    const route = asRecord(asArray(root?.routes)[0]);
    const duration = asNumber(route?.duration);
    const distance = asNumber(route?.distance);
    if (duration == null || distance == null) {
      return uncovered("commute", "The route could not be measured.");
    }
    const minutes = duration / 60;
    const miles = distance / 1609.344;
    return covered({
      id: "commute",
      score: commuteScore(minutes, input.mode),
      status: "measured",
      detail: `${Math.round(minutes)} min ${input.mode}, ${formatMiles(miles)}.`,
    });
  } catch {
    return uncovered("commute", "The commute could not be measured.");
  }
}
