# TASK 024 — Responsive game screen (scale up on bigger screens)

Status: ASSIGNED (builder) — 2026-11-02, on the Task 029 close-out
(queue order after 029 merged and deployed). Owner pick locked
2026-11-02: CAP the scale — see "The cap" below. Route: Switch #6
chats (Thirteen Builder).
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, in his words: "make the game screen responsive to
screen size so the game doesn't show too small on bigger screens."
The layout was tuned phone-first; on a desktop or large display the
whole stage — cards, table, opponents — sits small in the middle of
a big screen. The game should scale up with the viewport.

## Goal

- The play area grows proportionally on larger screens: bigger
  cards, bigger table, readable text, opponents and center pile
  scaling with the stage.
- Small-screen (phone) presentation does not regress — same feel,
  no new scrolling at common phone sizes.
- Overlays (How to Play, the Task 022 odds card, dialogs) scale and
  center sensibly at every size.
- The Task 015 center pile, fixed-size within the layout, scales
  with the stage instead of staying at its small-screen pixels.

## The cap (owner's pick, locked 2026-11-02)

- The stage scales proportionally as the viewport grows, and
  STOPS at **1.5x the current desktop presentation**, then centers
  with the backdrop filling the rest. It never fills an arbitrary
  screen beyond that point.
- Measurable anchor: the hand card. Today's desktop base is
  54 px wide; under this task it grows with the viewport up to a
  hard maximum of **81 px** wide. On a 2560 px-wide monitor the
  stage presents at the same size as at the cap point — centered,
  no larger.
- Below the cap, growth is smooth/proportional (no visibly jumping
  tiers as a window resizes — if the chosen approach steps, the
  steps must be fine enough to read as smooth at probe sizes).

## Approach notes (builder's choice within the locks above)

- Fluid root sizing: drive layout units from viewport-derived CSS
  variables (`vmin` / `clamp()`) so the whole stage scales
  proportionally with minimal restructuring.
- Scale-to-fit: a fixed-design stage transformed with
  `transform: scale()` computed on resize — pixel-faithful at every
  size, but text rendering and hit-testing need care.
- Breakpoint tiers: stepped sizes at a few widths — simplest, but
  visibly jumps between tiers.

## Non-regression constraints

- Tasks 011/019 motion rules untouched (hover media guard, selected
  pose outranks hover, one shared transition, reduced-motion off).
- No layout shift in the hand during play at any size; drag and tap
  targets scale with the visuals.
- Task 027's modal behavior must survive at the new sizes: a
  fitting banner shows no scrollbar on either edge, and the
  `.scrollbox` still measures scroll == client; Task 022's odds
  card still fits 360x640 with no scroll.
- Verification includes layout probes at phone (360x640),
  laptop (1440x900), and very large (2560x1440) sizes: card width
  measured at each (54 px class at phone, growing at laptop,
  capped at 81 px on the very large screen), stage centered past
  the cap, no horizontal scrolling anywhere. Suite green at
  whatever count it stands when this is assigned, no weakened
  assertions.
