import "server-only";

import { webMercatorTile } from "./geo";
import { fetchBytes } from "./http";
import { decodePng } from "./png";
import { covered, nightScore, uncovered } from "./score";
import type { Factor } from "./types";

const TILE =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Night_Lights/default/2016-01-01/GoogleMapsCompatible_Level8";

export async function nightFactor(lat: number, lon: number): Promise<Factor> {
  try {
    const tile = webMercatorTile(lat, lon, 8);
    const url = `${TILE}/8/${tile.row}/${tile.col}.png`;
    const image = decodePng(await fetchBytes(url, 7000));
    const pixel = image.pixel(tile.px, tile.py);
    const brightness = Math.max(pixel.r, pixel.g, pixel.b);
    return covered({
      id: "night",
      score: nightScore(brightness),
      status: "modeled",
      year: 2016,
      detail: `2016 VIIRS night-lights composite. Brightness ${brightness} of 255. Brighter scores worse. The pixel is the block from orbit, not the bedroom.`,
    });
  } catch {
    return uncovered("night", "The VIIRS night-lights tile could not be sampled.");
  }
}
