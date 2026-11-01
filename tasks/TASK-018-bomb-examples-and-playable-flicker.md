# TASK 018 — Cheatsheet bomb examples + playable-bomb flicker

Status: ASSIGNED (builder) — pilot task for the Codex-cloud pipeline.
Read `AGENTS.md` first; it governs how work flows in this repo.

Two independent parts, one PR. Branch `task-018-bomb-flicker` off
`main`. Open the PR against `main` and report per `AGENTS.md`.

## Part A — Bomb examples in How to Play

The help overlay's BOMBS BEAT 2s section (`index.html`) states the
ladder in words. Add concrete examples under it — short lines with
card glyphs, in the cheatsheet's existing voice and styling (extend
the section; do not restyle the overlay):

- Example: 4♠4♣ 5♠5♣ 6♠6♣ — a 3-pair double run — bombs a single 2.
- Example: pairs of 4s, 5s, 6s, and 7s — a 4-pair double run — bombs
  a pair of 2s.
- Example: four 9s — four of a kind — bombs a single 2 or a pair
  of 2s.

Facts must stay exactly true to the locked ladder. No other
cheatsheet section changes.

## Part B — Flicker the human's bomb cards when the bomb is playable

In the human's hand only, the cards forming a bomb get a flicker
animation **only while that bomb is currently playable**:

- It is the human's turn, and the play on the table is a single 2 the
  bomb beats, or a pair of 2s the bomb beats — per the engine's own
  bomb logic (`detectBomb` / `bombBeats` in `src/engine/bombs.ts`).
  Do not reimplement the ladder in the adapter.
- Comeback case: the human has passed earlier in this trick and now
  has a comeback turn against a 2 / pair of 2s — only comeback-legal
  bombs flicker (four of a kind, 4-pair double run), using the
  engine's comeback eligibility.
- Not playable = no flicker: not the human's turn, no 2 on the table,
  a target the bomb can't beat (e.g. triple 2s), or simply leading
  (a four of a kind that could be led does NOT flicker — the flicker
  means "this bombs what's on the table").
- If the hand holds two different playable bombs, both flicker. If a
  card belongs to a playable bomb, it flickers even if it also pairs
  elsewhere.

Presentation rules (same as the Task 014 animation layer):

- CSS keyframes on the hand card buttons — a noticeable flicker
  (opacity/glow pulse), transform/opacity/filter only. It must not
  fight the existing states: selected lift, drag, and the comeback
  foil treatment keep working; a selected flickering card stays
  readable.
- `prefers-reduced-motion` disables the flicker entirely.
- Pure presentation: game state and final DOM are identical with the
  flicker on or off; nothing gates input or timers.

## Tests

The suite is 71 at `main`. It must grow, with no assertion weakened:

- Part A: the overlay renders the three example lines (extend the
  existing help-overlay e2e coverage).
- Part B: drive the harness to the playable states and assert the
  flicker class is present on exactly the bomb's cards — vs a single
  2, vs a pair of 2s, and on a comeback turn — and absent in the
  negative states (no target, unbeatable target, not the human's
  turn, leading with a four of a kind).

## Out of scope

No engine, rule, scoring, or log changes. No CPU-hand indicators.
No changes to the Task 014 animations beyond what the flicker needs.
