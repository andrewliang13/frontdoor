---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Map

Mode: Operate.

Audience: someone choosing a US home.
Job: type any US address, read the live public-data score, compare a second address, save a shortlist in the browser.
Task: search, fly to the pin, read every factor, move a weight, or reopen a saved place.
Content: only `POST /api/place`, called twice when comparing. Empty `photos` stay an empty state with a link out.
Constraints: no login, shortlist in localStorage, no scraped listing photos, no invented prices or coverage. MapLibre on OpenFreeMap. Reduced motion cuts the flyover and the count-up.

Direction: inspection line, chosen on the decision page. Memorable moment: each factor arrives as a checked, estimated, or NI line, and the match counts up as the sheet’s total.

Unresolved: school, park, transit, highway, and building outline draw only when a factor includes geometry. A pin with no geometry stays a pin.

## Direction contract

THESIS: Each factor is a line on the inspection, marked checked, estimated, or NI, and a missed line stays on the sheet and out of the average. This refuses the floating score card.

OWN-WORLD: Carbon blue owns the bar. The sheet is form white. Graphite is the type. Not covered is an NI mark in madder. Measured is a drawn check. Modeled is a drawn estimate stroke. Source Sans 3, form-tight rows. The match is a total on the line.

STORY: They search a US address, the camera flies to the pin, and they read measured, modeled, and not covered. They set an office, a mode, and weights, compare a second address on those same weights, and save either place on this browser.

FIRST VIEWPORT: The map fills the viewport on OpenFreeMap, centered on the continental US. A carbon-blue bar spans the top: the word Frontdoor, one address field as the primary action, Score, Compare, and Shortlist. No sheet and no photo rail until a result or a request in flight. Then the left rail holds street photos or the empty public-photo state, and the right sheet opens with the match total, the place name, and every factor line.

FORM: Inspection line, first of the grounded list, the home inspection report. seed:10891a98e352f06a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
