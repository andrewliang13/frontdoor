import { googleMapsKey, mapillaryToken } from "@/lib/place/photos";

const MAX_BYTES = 4_000_000;

function inUnitedStates(lat: number, lon: number): boolean {
  if (lat < -15 || lat > 72) return false;
  if (lon <= -64 && lon >= -180) return true;
  return lon >= 144 && lon <= 180;
}

async function imageResponse(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Frontdoor/0.1 (national place score)" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!response.ok) return new Response(null, { status: 404 });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return new Response(null, { status: 404 });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return new Response(null, { status: 502 });
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

async function proxyMapillary(id: string): Promise<Response> {
  if (!/^[0-9]{1,30}$/.test(id)) return new Response(null, { status: 400 });
  const token = mapillaryToken();
  if (!token) return new Response(null, { status: 404 });
  const endpoint = new URL(`https://graph.mapillary.com/${id}`);
  endpoint.searchParams.set("fields", "thumb_1024_url");
  let payload: unknown;
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${token}`,
        "User-Agent": "Frontdoor/0.1 (national place score)",
      },
    });
    if (!response.ok) return new Response(null, { status: 404 });
    payload = await response.json();
  } catch {
    return new Response(null, { status: 502 });
  }
  const thumb =
    payload && typeof payload === "object" && "thumb_1024_url" in payload
      ? (payload as { thumb_1024_url?: unknown }).thumb_1024_url
      : null;
  if (typeof thumb !== "string" || !thumb.startsWith("https://") || thumb.includes(token)) {
    return new Response(null, { status: 404 });
  }
  return imageResponse(thumb);
}

async function proxyStreetView(lat: number, lon: number): Promise<Response> {
  const key = googleMapsKey();
  if (!key) return new Response(null, { status: 404 });
  const image = new URL("https://maps.googleapis.com/maps/api/streetview");
  image.searchParams.set("size", "640x400");
  image.searchParams.set("location", `${lat},${lon}`);
  image.searchParams.set("source", "outdoor");
  image.searchParams.set("key", key);
  return imageResponse(image.toString());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mapillary = url.searchParams.get("mapillary");
  if (mapillary) return proxyMapillary(mapillary);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inUnitedStates(lat, lon)) {
    return new Response(null, { status: 400 });
  }
  return proxyStreetView(lat, lon);
}
