---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Map

Visitor mode: Operate.

Audience: someone comparing a US address with where they need to be. Job: search, fly to the pin, read the score, compare a second address, keep a shortlist in the browser. No login.

Task: the map is the work surface. Search is the primary action. The left rail is street photos. The right panel is the score, then preferences. Proof is the factor row: number, year, source, and measured, modeled, or not covered.

Constraints: MapLibre on OpenFreeMap, no key. Real fetch to `POST /api/place` and `POST /api/compare`. No bundled scores, no scraped listing photos. Reduced motion cuts the flyover and the count-up.

Memorable moment: the pin arrives and the two column heads count up like clocks on a timetable.

The decision page could not collect an answer in this unattended run. The assigned direction is the one that was built.

## Direction contract

THESIS: The score is a commuter timetable on a map. Two addresses are two columns under one service, and a factor with no reading stays on the row and out of the head number. This refuses the floating white score card on a generic map.

OWN-WORLD: Route green `#0E6B4F` owns the header and the flat column heads. Ink `#1A1C19` on `#F4F6F3`. Vermilion `#D23B2E` is only the column on the map and the active pin. Barlow sets the schedule; Barlow Condensed tabular figures set the numbers. Square corners, one-pixel rules, rows packed like stops. Centre rail: rules are one device pixel, and vermilion is a key, not a fill. One frame: a single street photo crossfades, source underneath. Dominant field: the column head is a flat route-green block. Shared grid: the overall figure and the factor figures share one right-aligned column. Weight as density: the slider fill is the weight, and a cell that cannot compare is a broken rule, not a new hue.

STORY: Type any US address, watch the map arrive at the door, and read which factors were measured, modeled, or not covered. Set an office, a mode, and weights. Put a second address in the next column. Save either one in this browser and open it back onto the map.

FIRST VIEWPORT: The map fills the viewport, opened on the continental United States. A 56px route-green bar sits across the top: the word Frontdoor, the address field as the widest control and the primary action, Score, Compare, and Shortlist. Nothing else until a search. After a result, a 300px left rail slides in with one street photo and its source, and a right panel slides in, about 420px, or about 560px with two columns: green heads, the overall figures, ten hairline rows, then office, mode, sliders, and the sentence.

FORM: Paper transit timetable, third on the resonance list, after the quadrangle sheet and the statistical abstract. seed:63bd8d3cc639a2bd

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
