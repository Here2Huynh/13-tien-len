# TASK 030 — Remove the Bomb Odds button from the start screen

Status: ASSIGNED (builder) — Task 028 closed 2026-11-02; owner
feedback + pick locked 2026-11-02: remove ONLY the start-screen
button; the header button and the odds card stay. Route: the
Thirteen Builder chat (Switch #6).
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report (screenshot of the start screen, 2026-11-02): the
Bomb Odds button wraps onto its own row under START GAME and
HOW TO PLAY — in his words, "not necessary and ugly." Task 022 put
a Bomb Odds button in two spots; the owner now removes the
start-screen one. The header copy (next to How to Play in the
match header) is untouched and stays.

## Scope

- Remove `#odds-btn-start` from `index.html` and its wiring in
  `src/main.ts` (the `oddsStart` element lookup and its click
  binding). Nothing else in main.ts changes.
- The start screen's action row returns to two buttons — Start
  Game and How to Play — side by side and centered, as it was
  before Task 022.
- UNTOUCHED: the odds overlay and its figures, `#odds-btn-top` in
  the header, all odds content and styling.

## Tests

- Update the Task 022 e2e coverage: remove the start-screen button
  assertions and the start-screen open path; the required-ids list
  drops `odds-btn-start`.
- ADD a pin for the removal: the start screen contains no Bomb
  Odds button, and the header button still opens and closes the
  odds card with its content unchanged.
- No other assertion removed or weakened; if the test count
  changes, the PR explains exactly why.

## Proof in the PR

- Suite green, `npm run build` clean.
- Before/after screenshots of the start screen at phone width.
- A real-app probe: start screen shows two buttons only; in-game,
  the header Bomb Odds opens the card, Close dismisses it, game
  state untouched.
- Engine untouched; no other UI changes.

Note for Task 025 (later): after this task, the start screen's
only `.ghost` button is How to Play; the header ghost family is
unchanged.
