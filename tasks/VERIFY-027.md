# VERIFY-027 — Checklist for PR #26 (Task 027, modal scrollbars)

Status: ASSIGNED (verifier) — PR #26, head `1ee3386`
Verifier: the Thirteen Verifier chat (Pipeline Switch #4). The
builder was a foreman sub-agent (fallback run); you did not write
this code and you must not fix it. Fresh checkout of the PR head;
scratch work outside the repo; the repo tree stays clean.

Builder's claims (PR #26 body has the full report): 3 files
(+97/−8), suite 101 → 102, `src/main.ts` zero diff, engine
untouched, burst rule byte-identical; fix = banner scrolling moved
to a new inner `.scrollbox`, shell `.modal` gains
`overflow-x:hidden`.

## 1. Independent run
- `npm install`, `npm test` (expect **102/102**), `npm run build`
  clean; tree clean afterward.
- Diff vs main is exactly `index.html`, `src/styles.css`,
  `test/e2e.test.ts`. Confirm `src/main.ts` and `src/engine/` have
  ZERO diff, and the test diff weakens no assertion.

## 2. Fix audit (read the shipped CSS/HTML)
- `.modal` carries `overflow-x:hidden`; the banner modal is
  `.modal.scrollshell` (padding 0, overflow visible) wrapping
  `.scrollbox` (max-height `calc(88vh - 4px)`, overflow-y auto,
  overflow-x hidden, the old 26px/22px padding).
- The `.modal.instantwin::before` rule, `@keyframes burst`, and the
  reduced-motion block are byte-identical to main.

## 3. Layout probes (real Chromium on the built `dist/`)
- **Measure the `.scrollbox`, not the shell** (builder disclosure:
  the shell's raw scrollWidth still reports the burst's paint
  extent — it cannot scroll; the container is what matters).
- Round summary AND instant-win banner, during and after the
  burst, at 1280×800 and 360×640: scrollbox scroll == client on
  both axes at every step; no rendered scrollbar on either edge of
  a fitting summary.
- All overlays at both sizes: no horizontal scrolling anywhere;
  Bomb odds still fits 360×640 with no scroll (Task 022 baseline);
  start gate clean.
- Genuinely tall content still scrolls: How to Play at a short
  viewport (e.g. 1280×380) scrolls fully with Close visible and
  clickable; a banner forced past the cap keeps its original outer
  height and scrolls to the bottom with Continue reachable.

## 4. The gold wash survives
- Sample the instant-win banner at burst peak (~500 ms): the modal
  face still washes gold (the builder scrapped an approach that
  killed this — verify the shipped one preserves it; compare
  against a main build if useful).

## 5. Behavior unchanged
- Play a real round to the banner in the probe; the banner flow,
  buttons, and game state behave exactly as on main (src/main.ts
  is untouched — confirm by diff and by the playthrough).

## 6. Strings and scope
- No player-facing text changed anywhere; no "chop" in any
  player-facing string.
