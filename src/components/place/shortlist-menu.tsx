"use client";

import { formatScore } from "./factors";
import type { SavedPlace } from "./use-shortlist";

type ShortlistMenuProps = {
  items: SavedPlace[];
  onOpen: (place: SavedPlace) => void;
  onRemove: (address: string) => void;
};

export function ShortlistMenu({ items, onOpen, onRemove }: ShortlistMenuProps) {
  return (
    <div id="shortlist" className="shortlist-menu" role="region" aria-label="Shortlist">
      <p className="shortlist-note">Saved in this browser. No account.</p>
      {items.length === 0 ? (
        <p className="shortlist-empty">Nothing saved yet. Score an address, then save it.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.address}>
              <button type="button" className="shortlist-open" onClick={() => onOpen(item)}>
                <span>{item.label}</span>
                <span className="figure">{item.overall === null ? "—" : formatScore(item.overall)}</span>
              </button>
              <button type="button" className="shortlist-remove" onClick={() => onRemove(item.address)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
