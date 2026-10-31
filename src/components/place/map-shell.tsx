"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { Factor, FactorId, PlaceMode, PlaceResult } from "@/lib/place/types";
import { alignFactors, collectGeometry, DEFAULT_WEIGHTS, FACTOR_ORDER, gapFactor } from "./factors";
import type { MapPadding, MapPin } from "./map-canvas";
import { PhotoRail } from "./photo-rail";
import { ScoreError, fetchCompare, fetchPlace } from "./place-client";
import { ScorePanel, type ScoreColumn } from "./score-panel";
import { ShortlistMenu } from "./shortlist-menu";
import { useShortlist, type SavedPlace } from "./use-shortlist";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="map map-pending" role="region" aria-label="Map" />,
});

type Query = {
  address: string;
  office: string;
  mode: PlaceMode;
  weights: Record<FactorId, number>;
  note: string;
  second: string;
  comparing: boolean;
};

type Status = "idle" | "loading" | "ready" | "error";
type Source = "search" | "prefs" | "shortlist";

const INITIAL_QUERY: Query = {
  address: "",
  office: "",
  mode: "drive",
  weights: DEFAULT_WEIGHTS,
  note: "",
  second: "",
  comparing: false,
};

function samePad(a: MapPadding, b: MapPadding): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function MapShell() {
  const addressId = useId();
  const secondId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const photoSlotRef = useRef<HTMLDivElement>(null);
  const scoreSlotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const weightTimer = useRef<number | null>(null);
  const scoredKey = useRef("");
  const sentOffice = useRef("");
  const sentNote = useRef("");
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const queryRef = useRef(query);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [compareResult, setCompareResult] = useState<{ first: PlaceResult; second: PlaceResult } | null>(null);
  const [active, setActive] = useState<"first" | "second">("first");
  const [flyToken, setFlyToken] = useState(0);
  const [arriveKey, setArriveKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<MapPin | null>(null);
  const [pad, setPad] = useState<MapPadding>({ top: 56, right: 16, bottom: 16, left: 16 });
  const shortlist = useShortlist();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (weightTimer.current) window.clearTimeout(weightTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function rememberSent(next: Query) {
    sentOffice.current = next.office.trim();
    sentNote.current = next.note.trim();
  }

  function run(next: Query, source: Source) {
    const address = next.address.trim();
    const second = next.second.trim();
    const useCompare = next.comparing && second.length > 0;
    if (!address) {
      setStatus("error");
      setError("Enter a US address.");
      setAnnouncement("Enter a US address.");
      return;
    }

    const key = `${address}::${useCompare ? second : ""}`;
    const placeChanged = key !== scoredKey.current;
    if (placeChanged) {
      setPlace(null);
      setCompareResult(null);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    rememberSent(next);
    setStatus("loading");
    setError(null);

    const shared = {
      office: next.office.trim() || undefined,
      mode: next.mode,
      weights: next.weights,
      note: next.note.trim() || undefined,
    };

    void (async () => {
      try {
        if (useCompare) {
          const result = await fetchCompare({ ...shared, first: address, second }, controller.signal);
          if (id !== requestId.current) return;
          scoredKey.current = key;
          setCompareResult(result);
          setPlace(result.first);
          setPreview(null);
          setStatus("ready");
          if (placeChanged) {
            setFlyToken((token) => token + 1);
            setArriveKey((token) => token + 1);
          }
          const shown = active === "second" ? result.second : result.first;
          setAnnouncement(announce(shown, second && active === "second" ? second : address));
        } else {
          const result = await fetchPlace({ ...shared, address }, controller.signal);
          if (id !== requestId.current) return;
          scoredKey.current = key;
          setCompareResult(null);
          setPlace(result);
          setPreview(null);
          setActive("first");
          setStatus("ready");
          if (placeChanged) {
            setFlyToken((token) => token + 1);
            setArriveKey((token) => token + 1);
          }
          setAnnouncement(announce(result, address));
        }
        if (source !== "prefs") {
          requestAnimationFrame(() => panelRef.current?.focus());
        }
      } catch (caught) {
        if (isAbort(caught) || id !== requestId.current) return;
        const message = caught instanceof ScoreError
          ? caught.message
          : "The score request did not finish. Check the connection and try again.";
        setStatus("error");
        setError(message);
        setAnnouncement(message);
      }
    })();
  }

  function update(next: Query) {
    queryRef.current = next;
    setQuery(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...queryRef.current,
      address: queryRef.current.address.trim(),
      second: queryRef.current.second.trim(),
    };
    update(next);
    run(next, "search");
  }

  function toggleCompare() {
    const next = { ...queryRef.current, comparing: !queryRef.current.comparing };
    update(next);
    setActive("first");
    if (!next.comparing) setCompareResult(null);
    else requestAnimationFrame(() => secondRef.current?.focus());
  }

  function onWeight(id: FactorId, value: number) {
    const next = {
      ...queryRef.current,
      weights: { ...queryRef.current.weights, [id]: value },
    };
    update(next);
    if (weightTimer.current) window.clearTimeout(weightTimer.current);
    weightTimer.current = window.setTimeout(() => {
      if (!queryRef.current.address.trim()) return;
      run(queryRef.current, "prefs");
    }, 320);
  }

  function onMode(mode: PlaceMode) {
    const next = { ...queryRef.current, mode };
    update(next);
    if (next.address.trim()) run(next, "prefs");
  }

  function onOfficeCommit() {
    const next = queryRef.current;
    if (!next.address.trim()) return;
    if (next.office.trim() === sentOffice.current) return;
    run(next, "prefs");
  }

  function onNoteCommit() {
    const next = queryRef.current;
    if (!next.address.trim()) return;
    if (next.note.trim() === sentNote.current) return;
    run(next, "prefs");
  }

  function selectColumn(id: "first" | "second") {
    setActive(id);
    setFlyToken((token) => token + 1);
  }

  function onSave(id: "first" | "second") {
    const result = id === "second" ? compareResult?.second : compareResult?.first ?? place;
    const address = (id === "second" ? query.second : query.address).trim();
    if (!result || !address) return;
    shortlist.save({
      address,
      label: result.pin.label || address,
      overall: result.overall,
      savedAt: new Date().toISOString(),
      lat: result.pin.lat,
      lon: result.pin.lon,
    });
  }

  function openSaved(item: SavedPlace) {
    const next = { ...queryRef.current, address: item.address, comparing: false, second: "" };
    if (typeof item.lat === "number" && typeof item.lon === "number") {
      setPreview({
        id: "saved",
        lat: item.lat,
        lon: item.lon,
        label: item.label || item.address,
        active: true,
      });
      setFlyToken((token) => token + 1);
    }
    update(next);
    setMenuOpen(false);
    setActive("first");
    setCompareResult(null);
    run(next, "shortlist");
  }

  const showingCompare = query.comparing && compareResult !== null;
  const activeResult = showingCompare
    ? active === "second" ? compareResult.second : compareResult.first
    : place;
  const scoreOpen = status !== "idle";
  const photosOpen = status === "loading" || activeResult !== null;

  const columns: ScoreColumn[] = useMemo(() => {
    function column(id: "first" | "second", address: string, result: PlaceResult): ScoreColumn {
      return {
        id,
        address,
        label: result.pin.label || address,
        place: [result.pin.county, result.pin.state].filter(Boolean).join(", "),
        overall: result.overall,
        active: showingCompare && active === id,
        saved: shortlist.has(address),
      };
    }
    if (showingCompare && compareResult) {
      return [
        column("first", query.address, compareResult.first),
        column("second", query.second, compareResult.second),
      ];
    }
    if (place) return [column("first", query.address, place)];
    return [];
  }, [showingCompare, compareResult, place, query.address, query.second, active, shortlist]);

  const rows = useMemo(() => {
    if (showingCompare && compareResult) return pairFactors(compareResult.first.factors, compareResult.second.factors);
    if (place) return alignFactors(place.factors).map((factor) => ({ factor }));
    return [];
  }, [showingCompare, compareResult, place]);

  const features = useMemo(() => {
    if (showingCompare && compareResult) {
      return [...collectGeometry(compareResult.first), ...collectGeometry(compareResult.second)];
    }
    return collectGeometry(place);
  }, [showingCompare, compareResult, place]);

  const pins: MapPin[] = useMemo(() => {
    const pinOf = (id: string, result: PlaceResult, isActive: boolean): MapPin | null => {
      if (!Number.isFinite(result.pin.lat) || !Number.isFinite(result.pin.lon)) return null;
      return {
        id,
        lat: result.pin.lat,
        lon: result.pin.lon,
        label: result.pin.label || query.address,
        active: isActive,
      };
    };
    if (showingCompare && compareResult) {
      return [
        pinOf("first", compareResult.first, active === "first"),
        pinOf("second", compareResult.second, active === "second"),
      ].filter((pin): pin is MapPin => pin !== null);
    }
    if (place) {
      const pin = pinOf("first", place, true);
      return pin ? [pin] : [];
    }
    return preview ? [preview] : [];
  }, [showingCompare, compareResult, place, active, query.address, preview]);

  useEffect(() => {
    const measure = () => {
      const narrow = window.matchMedia("(max-width: 800px)").matches;
      const top = headerRef.current?.offsetHeight ?? 56;
      let next: MapPadding = { top, right: 16, bottom: 16, left: 16 };
      if (scoreOpen && narrow) {
        next = { top, right: 12, bottom: (dockRef.current?.offsetHeight ?? 320) + 8, left: 12 };
      } else if (scoreOpen) {
        next = {
          top,
          right: (scoreSlotRef.current?.offsetWidth ?? 420) + 12,
          bottom: 16,
          left: photosOpen ? (photoSlotRef.current?.offsetWidth ?? 300) + 12 : 16,
        };
      }
      setPad((current) => (samePad(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (headerRef.current) observer.observe(headerRef.current);
    if (dockRef.current) observer.observe(dockRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [scoreOpen, photosOpen, showingCompare, status]);

  const photoAddress = showingCompare && active === "second" ? query.second : query.address;
  const shellStyle = {
    "--bar": `${pad.top}px`,
    "--pad-left": `${pad.left}px`,
    "--pad-right": `${pad.right}px`,
    "--pad-bottom": `${pad.bottom}px`,
  } as CSSProperties;

  return (
    <div
      className="shell"
      style={shellStyle}
      data-score={scoreOpen ? "true" : "false"}
      data-photos={photosOpen ? "true" : "false"}
      data-compare={showingCompare ? "true" : "false"}
    >
      <p className="sr" aria-live="polite">{announcement}</p>
      <header className="topbar" ref={headerRef}>
        <h1 className="mark">Frontdoor</h1>
        <form className="search" onSubmit={submit}>
          <label className="sr" htmlFor={addressId}>US address</label>
          <input
            id={addressId}
            className="field"
            value={query.address}
            placeholder="US address"
            autoComplete="street-address"
            enterKeyHint="search"
            onChange={(event) => update({ ...queryRef.current, address: event.target.value })}
          />
          <button className="score-go" type="submit">
            {status === "loading" ? "Scoring" : "Score"}
          </button>
          <button
            className="ghost"
            type="button"
            aria-pressed={query.comparing}
            onClick={toggleCompare}
          >
            Compare
          </button>
          {query.comparing ? (
            <>
              <label className="sr" htmlFor={secondId}>Second US address</label>
              <input
                id={secondId}
                ref={secondRef}
                className="field"
                value={query.second}
                placeholder="Second US address"
                autoComplete="street-address"
                onChange={(event) => update({ ...queryRef.current, second: event.target.value })}
              />
            </>
          ) : null}
        </form>
        <div className="shortlist-wrap" ref={menuRef}>
          <button
            type="button"
            className="ghost"
            aria-expanded={menuOpen}
            aria-controls="shortlist"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Shortlist{shortlist.items.length ? ` ${shortlist.items.length}` : ""}
          </button>
          {menuOpen ? (
            <ShortlistMenu items={shortlist.items} onOpen={openSaved} onRemove={shortlist.remove} />
          ) : null}
        </div>
      </header>

      <MapCanvas pins={pins} features={features} padding={pad} flyToken={flyToken} onSelect={(id) => {
        if (id === "first" || id === "second") selectColumn(id);
      }} />

      <div className="dock" ref={dockRef}>
        <div className="photo-slot" ref={photoSlotRef} inert={photosOpen ? undefined : true}>
          {photosOpen ? (
            <PhotoRail
              key={photoAddress}
              address={photoAddress}
              photos={activeResult?.photos ?? []}
              loading={status === "loading" && activeResult === null}
            />
          ) : null}
        </div>
        <div className="score-slot" ref={scoreSlotRef} inert={scoreOpen ? undefined : true}>
          {scoreOpen ? (
            <ScorePanel
              columns={columns}
              rows={rows}
              status={status}
              error={error}
              mode={query.mode}
              office={query.office}
              brief={activeResult?.brief ?? ""}
              arriveKey={arriveKey}
              onSelect={selectColumn}
              onSave={onSave}
              onRetry={() => run(queryRef.current, "search")}
              panelRef={panelRef}
              weights={query.weights}
              note={query.note}
              onOffice={(value) => update({ ...queryRef.current, office: value })}
              onOfficeCommit={onOfficeCommit}
              onMode={onMode}
              onWeight={onWeight}
              onNote={(value) => update({ ...queryRef.current, note: value })}
              onNoteCommit={onNoteCommit}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function pairFactors(first: Factor[], second: Factor[]) {
  const left = new Map(alignFactors(first).map((factor) => [factor.id, factor]));
  const right = new Map(alignFactors(second).map((factor) => [factor.id, factor]));
  const ids: FactorId[] = [];
  for (const id of FACTOR_ORDER) {
    if (left.has(id) || right.has(id)) ids.push(id);
  }
  return ids.map((id) => ({
    factor: left.get(id) ?? gapFactor(id),
    other: right.get(id) ?? gapFactor(id),
  }));
}

function announce(result: PlaceResult, address: string): string {
  const name = result.pin.label || address;
  if (result.overall === null) return `Scored ${name}. No covered factor, so there is no average.`;
  return `Scored ${name}. Overall ${result.overall}.`;
}
