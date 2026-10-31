"use client";

import { useState } from "react";
import type { Photo } from "@/lib/place/types";

type PhotoRailProps = {
  address: string;
  photos: Photo[];
  loading: boolean;
};

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function PhotoRail({ address, photos, loading }: PhotoRailProps) {
  const [broken, setBroken] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const usable = photos
    .map((photo) => ({ ...photo, href: safeUrl(photo.url) }))
    .filter((photo): photo is Photo & { href: string } => Boolean(photo.href) && !broken.includes(photo.href ?? ""));
  const safeIndex = usable.length === 0 ? 0 : index % usable.length;
  const current = usable[safeIndex];
  const mapsHref = `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;

  return (
    <aside className="photo-rail" aria-label="Street photos">
      {loading && usable.length === 0 ? (
        <div className="photo-frame skeleton-frame" role="status">
          <span className="sr">Looking for a public street photo</span>
        </div>
      ) : null}

      {!loading && usable.length === 0 ? (
        <div className="photo-empty">
          <p>No public street photo is loaded.</p>
          <a href={mapsHref} target="_blank" rel="noopener noreferrer">
            Search this address on a map
          </a>
        </div>
      ) : null}

      {usable.length > 0 && current ? (
        <>
          <div className="photo-frame">
            {usable.map((photo, photoIndex) => (
              // Hosts come from the score response and are not known at build time.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.href}
                src={photo.href}
                alt={`${photo.source || "Street"} photo at ${address}`}
                data-show={photoIndex === safeIndex}
                onError={() => setBroken((currentBroken) => [...currentBroken, photo.href])}
              />
            ))}
          </div>
          <p className="photo-source">
            {current.source || "Public street photo"}
            {current.year ? ` · ${current.year}` : ""}
          </p>
          {usable.length > 1 ? (
            <div className="photo-nav">
              <button
                type="button"
                onClick={() => setIndex((value) => (value - 1 + usable.length) % usable.length)}
              >
                Previous
              </button>
              <span>
                {safeIndex + 1} of {usable.length}
              </span>
              <button
                type="button"
                onClick={() => setIndex((value) => (value + 1) % usable.length)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
