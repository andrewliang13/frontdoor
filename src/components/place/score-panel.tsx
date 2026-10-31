"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Factor, FactorId, PlaceMode } from "@/lib/place/types";
import { formatScore, isCovered, sourceLine } from "./factors";
import { PreferenceBar } from "./preference-bar";

export type ScoreColumn = {
  id: "first" | "second";
  address: string;
  label: string;
  place: string;
  overall: number | null;
  active: boolean;
  saved: boolean;
};

type FactorRow = {
  factor: Factor;
  other?: Factor;
};

type ScorePanelProps = {
  columns: ScoreColumn[];
  rows: FactorRow[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  mode: PlaceMode;
  brief: string;
  arriveKey: number;
  onSelect: (id: "first" | "second") => void;
  onSave: (id: "first" | "second") => void;
  onRetry: () => void;
  panelRef: RefObject<HTMLElement | null>;
  office: string;
  weights: Record<FactorId, number>;
  note: string;
  onOffice: (value: string) => void;
  onOfficeCommit: () => void;
  onMode: (mode: PlaceMode) => void;
  onWeight: (id: FactorId, value: number) => void;
  onNote: (value: string) => void;
  onNoteCommit: () => void;
};

function CountUp({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value === null || !Number.isFinite(value)) {
      node.textContent = "—";
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      node.textContent = formatScore(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 800);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = progress < 1 ? formatScore(Math.round(value * eased)) : formatScore(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = "0";
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span ref={ref} className={value === null ? "figure figure-empty" : "figure"}>
      {value === null ? "—" : formatScore(value)}
    </span>
  );
}

function StatusMark({ factor }: { factor: Factor }) {
  if (!isCovered(factor)) return <span className="mark mark-ni">NI</span>;
  if (factor.status === "modeled") {
    return (
      <span className="mark mark-est">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2 9.2c2-3.2 3.2-3.2 5 0s3 3.2 5 0" />
        </svg>
      </span>
    );
  }
  return (
    <span className="mark mark-ok">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 7.2 5.4 10.2 11.5 3.8" />
      </svg>
    </span>
  );
}

function FactorCell({
  factor,
  broken,
  verbose,
}: {
  factor: Factor;
  broken: boolean;
  verbose: boolean;
}) {
  return (
    <div className={broken ? "cell cell-broken" : "cell"}>
      <span className={isCovered(factor) ? "figure" : "figure figure-empty"}>
        {isCovered(factor) && factor.score !== null ? formatScore(factor.score) : "Not covered"}
      </span>
      {verbose ? <span className="cell-meta">{sourceLine(factor)}</span> : null}
      {verbose && factor.detail ? <span className="detail">{factor.detail}</span> : null}
    </div>
  );
}

export function ScorePanel({
  columns,
  rows,
  status,
  error,
  mode,
  brief,
  arriveKey,
  onSelect,
  onSave,
  onRetry,
  panelRef,
  office,
  weights,
  note,
  onOffice,
  onOfficeCommit,
  onMode,
  onWeight,
  onNote,
  onNoteCommit,
}: ScorePanelProps) {
  const comparing = columns.length > 1;
  const loading = status === "loading";
  const uncovered = rows.some(
    ({ factor, other }) => !isCovered(factor) || (other ? !isCovered(other) : false),
  );
  const noAverage = columns.length > 0 && columns.every((column) => column.overall === null);
  return (
    <section className="score-panel" aria-label="Score" ref={panelRef} tabIndex={-1} aria-busy={loading}>
      {loading ? (
        <p className="thinking" role="status">
          Scoring this address
        </p>
      ) : null}

      <div className="score-scroll">
        {error ? (
          <div className="error-block" role="alert">
            <p>{error}</p>
            <button type="button" className="retry" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}

        {columns.length === 0 && loading ? (
          <div className="skeleton-list" aria-hidden="true">
            <div className="skeleton skeleton-head" />
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton skeleton-row" key={index} />
            ))}
          </div>
        ) : null}

        {columns.length > 0 ? (
          <>
            {comparing ? (
              <div className="heads cols-2">
                <span className="bench-word">match</span>
                {columns.map((column) => (
                  <div className="head-figure" data-active={column.active} key={`${column.id}-figure`}>
                    <CountUp value={column.overall} />
                  </div>
                ))}
                <span />
                {columns.map((column) => (
                  <button
                    type="button"
                    className="head-address"
                    data-active={column.active}
                    aria-pressed={column.active}
                    key={`${column.id}-address`}
                    onClick={() => onSelect(column.id)}
                  >
                    {column.label}
                    {column.place ? <span className="head-place">{column.place}</span> : null}
                  </button>
                ))}
                <span />
                {columns.map((column) => (
                  <button
                    type="button"
                    className="save"
                    key={`${column.id}-save`}
                    onClick={() => onSave(column.id)}
                  >
                    {column.saved ? "Saved" : "Save"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="heads cols-1">
                <div className="head-copy">
                  <button type="button" className="head-address" onClick={() => onSelect(columns[0].id)}>
                    {columns[0].label}
                    {columns[0].place ? <span className="head-place">{columns[0].place}</span> : null}
                  </button>
                  <button type="button" className="save" onClick={() => onSave(columns[0].id)}>
                    {columns[0].saved ? "Saved" : "Save"}
                  </button>
                </div>
                <div className="head-figure">
                  <CountUp value={columns[0].overall} />
                  <span className="bench-word">{columns[0].overall === null ? "no average" : "match"}</span>
                </div>
              </div>
            )}

            {uncovered ? (
              <p className="average-note">
                {noAverage
                  ? "No covered factor, so there is no average."
                  : "Not covered rows stay listed and are left out of the average."}
              </p>
            ) : null}
            {brief ? <p className="brief">{brief}</p> : null}

            <div className="ledger" key={arriveKey}>
              {rows.map(({ factor, other }, index) => {
                const paired = Boolean(other);
                const comparable = other ? isCovered(factor) && isCovered(other) : false;
                return (
                  <div
                    className={paired ? "row cols-2" : "row cols-1"}
                    data-arrive="true"
                    style={{ animationDelay: `${index * 40}ms` }}
                    key={factor.id}
                  >
                    <div className="stop">
                      <StatusMark factor={factor} />
                      <p className="stop-name">{factor.label || factor.id}</p>
                      {!paired && factor.detail ? <p className="detail">{factor.detail}</p> : null}
                      {!paired ? <p className="meta">{sourceLine(factor)}</p> : null}
                    </div>
                    <FactorCell
                      factor={factor}
                      broken={paired && !comparable && !isCovered(factor)}
                      verbose={paired}
                    />
                    {other ? (
                      <FactorCell factor={other} broken={!comparable && !isCovered(other)} verbose />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        <PreferenceBar
          office={office}
          mode={mode}
          weights={weights}
          note={note}
          onOffice={onOffice}
          onOfficeCommit={onOfficeCommit}
          onMode={onMode}
          onWeight={onWeight}
          onNote={onNote}
          onNoteCommit={onNoteCommit}
        />
      </div>
    </section>
  );
}
