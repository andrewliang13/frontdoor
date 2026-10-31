import { inflateSync } from "node:zlib";

export type Rgba = { r: number; g: number; b: number; a: number };

export type DecodedPng = {
  width: number;
  height: number;
  pixel: (x: number, y: number) => Rgba;
};

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Decode an 8-bit non-interlaced PNG. Tiles from GIBS and BTS fit this. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("Not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) break;
    const chunk = bytes.subarray(start, end);
    if (type === "IHDR") {
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === "PLTE") {
      palette = chunk;
    } else if (type === "tRNS") {
      transparency = chunk;
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (bitDepth !== 8 || interlace !== 0 || width < 1 || height < 1 || width > 2048 || height > 2048) {
    throw new Error("Unsupported PNG");
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error("Unsupported PNG color");
  const raw = inflateSync(concat(idat));
  const stride = width * channels;
  const rows: Uint8Array[] = [];
  let cursor = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const row = new Uint8Array(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    if (filter === 1 || filter === 3 || filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? row[x - channels] : 0;
        const up = previous[x];
        const upLeft = x >= channels ? previous[x - channels] : 0;
        if (filter === 1) row[x] = (row[x] + left) & 255;
        else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
        else row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      }
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + previous[x]) & 255;
    } else if (filter !== 0) {
      throw new Error("Bad PNG filter");
    }
    previous = row;
    rows.push(row);
  }

  const pixel = (x: number, y: number): Rgba => {
    const row = rows[Math.min(height - 1, Math.max(0, y))];
    const sx = Math.min(width - 1, Math.max(0, x));
    if (colorType === 6) {
      const i = sx * 4;
      return { r: row[i], g: row[i + 1], b: row[i + 2], a: row[i + 3] };
    }
    if (colorType === 2) {
      const i = sx * 3;
      return { r: row[i], g: row[i + 1], b: row[i + 2], a: 255 };
    }
    if (colorType === 0) {
      const value = row[sx];
      return { r: value, g: value, b: value, a: 255 };
    }
    if (colorType === 4) {
      const i = sx * 2;
      const value = row[i];
      return { r: value, g: value, b: value, a: row[i + 1] };
    }
    const index = row[sx];
    const paletteAt = (palette ?? new Uint8Array()) ;
    const r = paletteAt[index * 3] ?? 0;
    const g = paletteAt[index * 3 + 1] ?? 0;
    const b = paletteAt[index * 3 + 2] ?? 0;
    const a = transparency && index < transparency.length ? transparency[index] : 255;
    return { r, g, b, a };
  };

  return { width, height, pixel };
}
