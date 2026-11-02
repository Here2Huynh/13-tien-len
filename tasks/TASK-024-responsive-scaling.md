# TASK 024 — Responsive game screen (scale up on bigger screens)

Status: PLANNING (owner FR 2026-11-01; queued behind Tasks 022 and
023 — becomes ASSIGNED (builder) after the owner reviews the
approach)
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

## Open design point (owner's call at assignment)

- Cap the scale at some maximum stage size on very large monitors,
  or fill whatever screen is available? (Foreman's lean: cap it —
  past a point, bigger stops being better and the table reads
  sparse. The cap value is the owner's pick.)

## Approach notes (to weigh at assignment, not decided)

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
- Verification includes layout probes at phone and desktop sizes
  (the foreman runs real-browser checks on top of the suite), suite
  green at whatever count it stands when this is assigned, no
  weakened assertions.
