import "server-only";

import { asArray, asNumber, asRecord, asString, fetchJson } from "./http";
import type { Photo } from "./types";

export function mapillaryToken(): string | null {
  return readEnv("MAPILLARY_TOKEN");
}

export function googleMapsKey(): string | null {
  return readEnv("GOOGLE_MAPS_API_KEY");
}

export async function loadPhotos(lat: number, lon: number): Promise<Photo[]> {
  const [mapillary, streetView] = await Promise.all([
    mapillaryPhotos(lat, lon),
    streetViewPhoto(lat, lon),
  ]);
  return [...mapillary, ...streetView];
}

async function mapillaryPhotos(lat: number, lon: number): Promise<Photo[]> {
  const token = mapillaryToken();
  if (!token) return [];
  try {
    const box = around(lat, lon, 0.1);
    const params = new URLSearchParams({
      fields: "id,thumb_1024_url,thumb_256_url,captured_at",
      bbox: `${box.xmin},${box.ymin},${box.xmax},${box.ymax}`,
      limit: "4",
    });
    const payload = await fetchJson(
      `https://graph.mapillary.com/images?${params}`,
      { headers: { Authorization: `OAuth ${token}` } },
      6000,
    );
    const photos: Photo[] = [];
    for (const item of asArray(asRecord(payload)?.data)) {
      const record = asRecord(item);
      const id = asString(record?.id);
      if (!id || !/^[0-9]{1,30}$/.test(id)) continue;
      const thumb = asString(record?.thumb_1024_url) ?? asString(record?.thumb_256_url);
      const year = captureYear(asNumber(record?.captured_at));
      const publicThumb =
        thumb &&
        thumb.startsWith("https://") &&
        !thumb.includes("access_token") &&
        !thumb.includes(token)
          ? thumb
          : null;
      const url = publicThumb ?? `/api/photo?mapillary=${encodeURIComponent(id)}`;
      photos.push(year === undefined ? { url, source: "Mapillary" } : { url, source: "Mapillary", year });
    }
    return photos;
  } catch {
    return [];
  }
}

async function streetViewPhoto(lat: number, lon: number): Promise<Photo[]> {
  const key = googleMapsKey();
  if (!key) return [];
  const metadata = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metadata.searchParams.set("location", `${lat},${lon}`);
  metadata.searchParams.set("source", "outdoor");
  metadata.searchParams.set("key", key);
  try {
    const payload = await fetchJson(metadata.toString(), undefined, 5000);
    if (asString(asRecord(payload)?.status) !== "OK") return [];
  } catch {
    return [];
  }
  const url =
    `/api/photo?lat=${encodeURIComponent(lat.toFixed(6))}` +
    `&lon=${encodeURIComponent(lon.toFixed(6))}`;
  return [{ url, source: "Google Street View" }];
}

function around(lat: number, lon: number, miles: number) {
  const dLat = miles / 69;
  const dLon = miles / (69.172 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat };
}

function captureYear(timestamp: number | null): number | undefined {
  if (timestamp == null || timestamp <= 0) return undefined;
  const millis = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const year = new Date(millis).getUTCFullYear();
  return year >= 2000 && year <= 2100 ? year : undefined;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
