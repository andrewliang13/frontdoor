# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js App Router, TypeScript, Tailwind, MapLibre. The user named the stack.

## Users

Someone choosing a US home. They type any US address, see a live public-data score, compare a second address, and save a shortlist in the browser.

## Product Purpose

Frontdoor scores any US address from national public layers and shows it on one map. Success is a pin the camera can fly to, a score they can read factor by factor, a second address beside the first, and a shortlist they can reopen later in the same browser.

## Positioning

A deterministic engine scores national public layers. Muse only explains numbers the engine already computed. Uncovered factors stay visible and are left out of the average. A neighboring listing site could not truthfully claim this: there is no scraped listing, no price, and no score the engine did not return.

## Operating Context

The person works in the browser, full viewport. They search a US address. The camera flies to the pin the API returns. Street photos sit on the left. The score sits on the right, with preferences in that panel. Compare puts a second address beside the first. The shortlist stays in the browser.

## Capabilities and Constraints

- Search any US address. The pin comes from `POST /api/place`. The UI does not invent coordinates. If the result has only a pin, the map shows the pin and the factor rows.
- Request body is `PlaceRequest`: `address`, optional `office`, `mode` (`drive` | `bike` | `walk`), `weights`, optional `note`. Response is `PlaceResult`: `pin`, `factors`, `overall`, `brief`, `photos`.
- Compare calls `/api/place` twice. Shared weights and the same office. Two columns. A factor row compares only when both results covered that factor.
- Factors, each 0–100 when covered: commute, schools, parks, transit, highway, noise, night, daylight, flood, crime. Overall is the weighted average of covered factors. `not_covered` stays visible and is left out of the average. Each row shows its number, year, source, and status (`measured`, `modeled`, or `not_covered`).
- Preferences: office address, mode, a slider for every `FactorId`, and a sentence box that posts as `note`. Changing a slider re-posts the same address with the new weights.
- No login. The shortlist is `localStorage`: the score, plus reopen on the map. No account.
- Street photos come from `result.photos` (Mapillary or Street View) and can be empty. The empty state says no public street photo is loaded and links out. Do not embed scraped Redfin or Zillow photos. No image is stored in the repo.
- Do not invent prices, customers, or coverage claims the engine does not return.
- MapLibre, OpenFreeMap tiles, no map token.
- Motion: fly to the pin, panels slide in, the score counts up, rows stagger, photos crossfade, a thinking shimmer while the request is in flight. Reduced motion cuts the flyover and the count-up.
- The scoring route and `src/lib/place` implementation are owned elsewhere. This surface imports types from `src/lib/place/types.ts` only.

## Brand Commitments

The product name is Frontdoor. No palette, type, or visual identity was set.

## Evidence on Hand

No prices, customers, logos, or listing photos are in the repo. Scores, briefs, and photos are whatever `/api/place` returns. A missing route is an error, not a fixture to invent.

## Product Principles

- Show every factor the engine returned, including the ones left out of the average.
- The number, the year, the source, and the status are the reading. The brief only explains those numbers.
- Two addresses, shared weights, one office. A factor compares only when both covered it.
- The shortlist stays on this browser. There is no account.
- Street photos are the API’s or a link out.

## Accessibility & Inclusion

Reduced motion cuts the camera flyover and the score count-up. The score, the uncovered rows, and the empty photo state stay readable without those motions.
