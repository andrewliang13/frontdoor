"use client";

import { useCallback, useSyncExternalStore } from "react";

export type SavedPlace = {
  address: string;
  label: string;
  overall: number | null;
  savedAt: string;
  lat?: number;
  lon?: number;
};

const STORAGE_KEY = "frontdoor.shortlist";
const CHANGE_EVENT = "frontdoor-shortlist";
const EMPTY: SavedPlace[] = [];

let cachedRaw: string | null = null;
let cachedItems: SavedPlace[] = EMPTY;

function isSaved(value: unknown): value is SavedPlace {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedPlace>;
  return typeof record.address === "string" && record.address.trim().length > 0;
}

function parse(raw: string | null): SavedPlace[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const items = parsed.filter(isSaved).map((item) => ({
      address: item.address,
      label: typeof item.label === "string" && item.label.trim() ? item.label : item.address,
      overall: typeof item.overall === "number" ? item.overall : null,
      savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
      lat: typeof item.lat === "number" ? item.lat : undefined,
      lon: typeof item.lon === "number" ? item.lon : undefined,
    }));
    return items.length ? items : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readSnapshot(): SavedPlace[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedItems;
  }
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  cachedItems = parse(raw);
  return cachedItems;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function write(next: SavedPlace[]) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // The list still updates in memory when storage is blocked.
  }
  cachedRaw = raw;
  cachedItems = next.length ? next : EMPTY;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function useShortlist() {
  const items = useSyncExternalStore(subscribe, readSnapshot, () => EMPTY);

  const save = useCallback((place: SavedPlace) => {
    const key = normalizeAddress(place.address);
    const rest = readSnapshot().filter((item) => normalizeAddress(item.address) !== key);
    write([place, ...rest]);
  }, []);

  const remove = useCallback((address: string) => {
    const key = normalizeAddress(address);
    write(readSnapshot().filter((item) => normalizeAddress(item.address) !== key));
  }, []);

  const has = useCallback(
    (address: string) => items.some((item) => normalizeAddress(item.address) === normalizeAddress(address)),
    [items],
  );

  return { items, save, remove, has };
}
