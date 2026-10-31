---
name: Frontdoor
description: A full-viewport map for scoring a US address.
colors:
  route: "#0E6B4F"
  route-ink: "#F7FBF8"
  ink: "#1A1C19"
  paper: "#F4F6F3"
  key: "#D23B2E"
  line: "#D3DDD7"
  field: "#FFFFFF"
  muted: "#244038"
  danger-ink: "#6D221C"
  danger-paper: "#F8ECEA"
  danger-line: "#E2B2AC"
  land: "#D5DDD8"
typography:
  wordmark:
    fontFamily: "Barlow Condensed, Segoe UI, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
  score:
    fontFamily: "Barlow Condensed, Segoe UI, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0em"
  body:
    fontFamily: "Barlow, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  row:
    fontFamily: "Barlow Condensed, Segoe UI, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0em"
rounded:
  none: "0px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "28px"
components:
  button-score:
    backgroundColor: "{colors.route-ink}"
    textColor: "{colors.route}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-score-hover:
    backgroundColor: "{colors.field}"
    textColor: "{colors.route}"
  button-ghost:
    backgroundColor: "{colors.route}"
    textColor: "{colors.route-ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-ghost-pressed:
    backgroundColor: "{colors.route-ink}"
    textColor: "{colors.route}"
  input-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "36px"
  column-head:
    backgroundColor: "{colors.route}"
    textColor: "{colors.route-ink}"
    typography: "{typography.score}"
    rounded: "{rounded.none}"
    padding: "14px 16px 12px"
---

## Overview

Frontdoor is one map. The header is a route-green bar. After a search, street photos sit on the left and the score sits on the right as a timetable: one column of figures, or two when comparing. Corners are square. Numbers share a right-aligned tabular column. Vermilion marks only the column on the map and the active pin.

## Colors

Route green carries the header and the score heads. Paper is the panel ground. Ink is the text. Vermilion is the selection key and the focus ring, not a fill for chrome. Muted green-ink is secondary text on paper. Danger colors are only for a failed score. The map itself keeps OpenFreeMap's own land and water.

## Typography

Barlow is the schedule. Barlow Condensed sets the wordmark and every figure, with tabular numbers. The overall figure is 3rem. Factor figures are 1.35rem in the same column. Body copy stays 16px. Do not set a label above the overall figure.

## Layout

The map fills the viewport. The header is 56px until the search wraps. On a wide screen the photo rail is up to 300px and the score panel is up to 420px, or 640px while comparing. Below 800px the search fields stack, and the photos and score become a bottom sheet no taller than 58vh that scrolls inside itself.

## Elevation & Depth

Panels are flat and opaque, separated from the map by a 1px line. The shortlist menu is the one shadow: `0 10px 24px rgba(16, 32, 24, 0.16)`.

## Shapes

No radius. The map pin is the exception: a small circle, green, or vermilion when it is the place on screen.

## Components

The score button is paper on the green bar. Compare and Shortlist are ghost buttons; the pressed one turns paper. Factor rows are hairline rules, not cards. A covered figure is the number. An uncovered figure is an em dash with a broken rule under it, and the row stays on screen. Sliders use the native control with a route-green accent so the fill shows the weight. Status is the words Measured, Modeled, or Not covered.

## Do's and Don'ts

Do keep the address field the primary action. Do show the source, year, and status on every factor. Do leave a not-covered row visible and out of the average. Do cut the camera flyover and the score count-up when reduced motion is requested.

Don't scrape listing photos. Don't draw a progress ring in place of a number. Don't label a place safe or unsafe. Don't put a second color on inactive chrome.
