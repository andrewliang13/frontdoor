import "server-only";

import { briefFor, localBrief } from "./brief";
import { crimeFactor } from "./crime";
import { geocodeAddress } from "./geocode";
import { LAYER_MS, withTimeout } from "./http";
import { nightFactor } from "./night";
import { noiseFromHighway, sampleNoise } from "./noise";
import { osmFactors } from "./overpass";
import { loadPhotos } from "./photos";
import { parsePreferences, type ParsedPreferences } from "./preferences";
import { commuteFactor } from "./route";
import { FACTOR_IDS, MISS, overallScore, sanitizeWeights, uncovered } from "./score";
import { schoolsFactor } from "./schools";
import { daylightFactor } from "./structures";
import { floodFactor } from "./flood";
import type { Factor, FactorId, Photo, PlaceMode, PlaceResult, Weights } from "./types";

export class AddressNotFoundError extends Error {
  constructor() {
    super("Census could not match that address.");
    this.name = "AddressNotFoundError";
  }
}

async function soft<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await withTimeout(work, LAYER_MS);
  } catch {
    return fallback;
  }
}

function missed(id: FactorId): Factor {
  return uncovered(id, MISS);
}

export async function scoreAddress(input: {
  address: string;
  office?: string;
  mode?: PlaceMode;
  weights?: Weights;
  note?: string;
}): Promise<PlaceResult> {
  const address = input.address.trim();
  const [located, prefs] = await Promise.all([
    geocodeAddress(address),
    withTimeout(parsePreferences(input.note), LAYER_MS).catch(
      (): ParsedPreferences => ({ weights: {} }),
    ),
  ]);
  if (!located) throw new AddressNotFoundError();

  const mode = prefs.mode ?? input.mode ?? "drive";
  const typedOffice = input.office?.trim();
  const office = prefs.office ?? (typedOffice ? typedOffice : undefined);
  const weights = { ...sanitizeWeights(input.weights), ...prefs.weights };
  const { lat, lon } = located.pin;

  const [commute, schools, osm, noise, night, daylight, flood, crime, photos] = await Promise.all([
    soft(commuteFactor({ lat, lon, office, mode }), null),
    soft(schoolsFactor(lat, lon), null),
    soft(osmFactors(lat, lon), null),
    soft(sampleNoise(lat, lon, located.pin.state), null),
    soft(nightFactor(lat, lon), null),
    soft(daylightFactor(lat, lon), null),
    soft(floodFactor(lat, lon), null),
    soft(crimeFactor(located), null),
    soft(loadPhotos(lat, lon), [] as Photo[]),
  ]);

  const factors: Factor[] = FACTOR_IDS.map((id) => {
    if (id === "commute") return commute ?? missed(id);
    if (id === "schools") return schools ?? missed(id);
    if (id === "parks") return osm?.parks ?? missed(id);
    if (id === "transit") return osm?.transit ?? missed(id);
    if (id === "highway") return osm?.highway ?? missed(id);
    if (id === "noise") return noise ?? noiseFromHighway(osm?.highwayMiles ?? null);
    if (id === "night") return night ?? missed(id);
    if (id === "daylight") return daylight ?? missed(id);
    if (id === "flood") return flood ?? missed(id);
    return crime ?? missed(id);
  });

  const brief = await soft(briefFor(factors), localBrief(factors));
  return {
    pin: located.pin,
    factors,
    overall: overallScore(factors, weights),
    brief,
    photos,
  };
}
