"use client";

import { useId } from "react";
import type { FactorId, PlaceMode } from "@/lib/place/types";
import { FACTOR_LABELS, FACTOR_ORDER, modeLabel } from "./factors";

type PreferenceBarProps = {
  office: string;
  mode: PlaceMode;
  weights: Record<FactorId, number>;
  note: string;
  onOffice: (value: string) => void;
  onOfficeCommit: () => void;
  onMode: (mode: PlaceMode) => void;
  onWeight: (id: FactorId, value: number) => void;
  onNote: (value: string) => void;
  onNoteCommit: () => void;
};

const MODES: PlaceMode[] = ["drive", "bike", "walk"];

export function PreferenceBar({
  office,
  mode,
  weights,
  note,
  onOffice,
  onOfficeCommit,
  onMode,
  onWeight,
  onNote,
  onNoteCommit,
}: PreferenceBarProps) {
  const baseId = useId();

  return (
    <fieldset className="prefs">
      <legend>Preferences</legend>
      <label className="pref-field" htmlFor={`${baseId}-office`}>
        <span>Office</span>
        <input
          id={`${baseId}-office`}
          className="field"
          value={office}
          autoComplete="street-address"
          placeholder="Office address"
          onChange={(event) => onOffice(event.target.value)}
          onBlur={onOfficeCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onOfficeCommit();
            }
          }}
        />
      </label>

      <div className="mode" role="radiogroup" aria-label="Travel mode">
        {MODES.map((item) => (
          <label key={item}>
            <input
              type="radio"
              name={`${baseId}-mode`}
              value={item}
              checked={mode === item}
              onChange={() => onMode(item)}
            />
            {modeLabel(item)}
          </label>
        ))}
      </div>

      <div className="sliders">
        {FACTOR_ORDER.map((id) => {
          const inputId = `${baseId}-${id}`;
          const value = weights[id];
          return (
            <div className="slider-row" key={id}>
              <label htmlFor={inputId}>{FACTOR_LABELS[id]}</label>
              <output htmlFor={inputId}>{value}</output>
              <input
                id={inputId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                onChange={(event) => onWeight(id, Number(event.target.value))}
              />
            </div>
          );
        })}
      </div>

      <label className="pref-field" htmlFor={`${baseId}-note`}>
        <span>Sentence</span>
        <textarea
          id={`${baseId}-note`}
          className="field note"
          rows={2}
          value={note}
          placeholder="What matters at this door"
          onChange={(event) => onNote(event.target.value)}
          onBlur={onNoteCommit}
        />
      </label>
      <p className="pref-hint">Sent with the score as a note. It does not change a weight on its own.</p>
    </fieldset>
  );
}
