# TASK-045: Visual batch — contrast, touch targets, reduced-motion foil, desktop stage fit (audit #11 + #12 + #14 + #3)

Status: COMPLETE — PR #47 merged d437856 (verifier PASS, all 9
VERIFY-045 items, head 9bf2703), deployed b957417e-645d-4bbe-a3ee-97ec5d0d20e6.
Suite 178 -> 179.

## Why

Four Task 035 audit findings, all presentation:

- **#11 Contrast:** the Play button's white text on #3ecf6f measures
  2.03:1; the blue #009dff measures 2.89:1; the Pass red measures
  3.85:1 — all under WCAG AA for their use.
- **#12 Touch targets:** action buttons measure ~33px / ~41px; the
  CPU card-count text renders at 10.5px.
- **#14 (narrow fix):** the Task 034 bomb foil's peak washes the
  bomb cards' corners; under `prefers-reduced-motion` the animation
  freezes with the bright band parked over the ranks.
- **#3 Desktop stage fit:** the stage zoom is width-only, so on
  short/wide viewports the player's hand falls below the fold.

Owner rulings (2026-11-04 walk-through): #11 — deepen the three
primary shades until they pass contrast, hues kept. #12 — action
buttons to >= 44px, CPU counts up from 10.5px. #14 — narrow fix
only: hide the foil layer under reduced motion; the locked Task 034
"V1 Golden foil" gradient itself does not change. #3 — make the
stage scale height-bound as well, so table + hand fit the viewport.

## Scope
- Deepen the Play green, the blue, and the Pass red to shades that
  pass WCAG AA contrast for the text/UI they carry; keep each hue
  recognizably the same color family. Everywhere the old shades
  appear as the primary control colors, the new shades apply
  consistently.
- Action buttons (Play cards / Pass, and any sibling primary
  actions in the same row) get a minimum 44px touch target; the
  CPU seats' card-count text goes up from 10.5px to a legible size.
- Under `prefers-reduced-motion`, the bomb-card foil layer is not
  rendered at all. Without reduced motion, the foil renders exactly
  as on main — the Task 034 V1 gradient stops are locked and
  byte-identical.
- The desktop stage scale considers viewport height as well as
  width, so at short desktop viewports (e.g. 1280x640, 1440x700)
  the whole table including the player's hand is visible without
  page scrolling. Scaling stays proportional — no distortion.

## Non-goals
- No gameplay, engine, scoring, or save change of any kind.
- No change to the Task 034 foil gradient, the Task 032/042 banner,
  the Task 033 beat, or the Task 037 phone layout (pile 144px,
  one-row action row) — the phone one-screen fit must not regress.
- No new settings or controls; this is a styling batch only.

## Rules
- Strict TS, zero `any`; suite count never drops; no existing
  assertion removed or loosened without a build-report disclosure
  (CSS pins from earlier tasks may need updating to the new shades —
  list every updated pin in the report).
- Presentation-only: seeded full-match equivalence vs main —
  identical plays, scores, outcomes, and logs.
- Player-facing vocabulary: "Bomb penalty" only; "Chop" in no
  player-facing string.
- Option C probes: patched Chrome for Testing 156.0.8078.80,
  localOnly, locally built dist, fresh profiles, sandbox OFF.
  A full autopilot match takes ~35 min and outlives tool caps —
  use short seeded/scripted probes, never a full-match probe.

## Acceptance
- VERIFY-045 items all pass.
