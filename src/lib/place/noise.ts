import "server-only";

import { webMercatorTile } from "./geo";
import { fetchBytes } from "./http";
import { decodePng, type Rgba } from "./png";
import { covered, formatMiles, noiseScoreFromDb, uncovered } from "./score";
import type { Factor } from "./types";

const CAVEAT =
  "Average day, no buildings or sound walls, freight rail absent, not a bedroom reading.";

const BANDS = [
  { r: 255, g: 193, b: 7, db: 47.5, label: "45.0–49.9" },
  { r: 255, g: 128, b: 0, db: 52.5, label: "50.0–54.9" },
  { r: 255, g: 0, b: 0, db: 57.5, label: "55.0–59.9" },
  { r: 255, g: 51, b: 153, db: 65, label: "60.0–69.9" },
  { r: 163, g: 0, b: 204, db: 75, label: "70.0–79.9" },
  { r: 82, g: 0, b: 204, db: 85, label: "80.0–89.9" },
  { r: 0, g: 0, b: 255, db: 92, label: "90 or higher" },
];

function serviceFor(state: string): { name: string; hawaii: boolean } | null {
  if (state === "AK") return { name: "NTAD_Noise_2020_Alaska_Aviation_Road_Rail", hawaii: false };
  if (state === "HI") return { name: "NTAD_Noise_2020_Hawaii_Aviation_Road", hawaii: true };
  if (state === "PR" || state === "GU" || state === "VI" || state === "AS" || state === "MP") {
    return null;
  }
  return { name: "NTAD_Noise_2020_CONUS_Aviation_Road_Rail", hawaii: false };
}

function matchBand(pixel: Rgba): (typeof BANDS)[number] | null {
  if (pixel.a < 20) return null;
  let best: (typeof BANDS)[number] | null = null;
  let bestDistance = 40;
  for (const band of BANDS) {
    const distance = Math.hypot(pixel.r - band.r, pixel.g - band.g, pixel.b - band.b);
    if (distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best;
}

export async function sampleNoise(lat: number, lon: number, state: string): Promise<Factor | null> {
  const service = serviceFor(state);
  if (!service) return null;
  try {
    const tile = webMercatorTile(lat, lon, 12);
    const url = `https://geo.dot.gov/server/rest/services/Hosted/${service.name}/MapServer/tile/12/${tile.row}/${tile.col}`;
    const bytes = await fetchBytes(url, 7000);
    const image = decodePng(bytes);
    let loudest: (typeof BANDS)[number] | null = null;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const band = matchBand(image.pixel(tile.px + dx, tile.py + dy));
        if (band && (loudest == null || band.db > loudest.db)) loudest = band;
      }
    }
    const hawaii = service.hawaii ? " The Hawaii layer is aviation and road." : "";
    if (!loudest) {
      return covered({
        id: "noise",
        score: noiseScoreFromDb(45),
        status: "modeled",
        year: 2020,
        detail: `No mapped contour at this point, below about 45 dB LAeq (2020). ${CAVEAT}${hawaii}`,
      });
    }
    return covered({
      id: "noise",
      score: noiseScoreFromDb(loudest.db),
      status: "modeled",
      year: 2020,
      detail: `Modeled 24-hour LAeq about ${loudest.db} dB, band ${loudest.label} (2020). ${CAVEAT}${hawaii}`,
    });
  } catch {
    return null;
  }
}

export function noiseFromHighway(miles: number | null): Factor {
  if (miles == null) {
    return uncovered(
      "noise",
      "The noise map could not be sampled, and there is no highway distance to fall back on.",
    );
  }
  const db = miles < 0.1 ? 75 : miles < 0.25 ? 70 : miles < 0.5 ? 65 : miles < 1 ? 58 : miles < 2 ? 50 : 45;
  return covered({
    id: "noise",
    score: noiseScoreFromDb(db),
    status: "modeled",
    detail: `The BTS sample did not return. Modeled from highway distance (${formatMiles(miles)}): about ${db} dB. ${CAVEAT}`,
  });
}
