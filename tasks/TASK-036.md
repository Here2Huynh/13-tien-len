# TASK-036: Split src/main.ts — structure refactor, zero behavior change

Status: ASSIGNED (builder) — filed 2026-11-04. Suite baseline: 122.
Source: Task 035 audit finding #17, picked by John 2026-11-04
("Build #17 — split main.ts now", over the foreman's defer
recommendation). Sequenced FIRST among the audit-batch code tasks
so the later tasks work in the new structure.

## The problem (audit #17, verified)

`src/main.ts` is ~1,351 lines holding ~25 module-level mutable
trackers (fx, celebration beat, drag, hand order, persistence,
banner). Two behaviors hang on JavaScript object identity:

- "New round" is detected as *a new trick state object*
  (main.ts:1094, 327, 397).
- "Instant-win beat already played" is detected as *the same
  summary object* (main.ts:799).

Any future engine change that copies state instead of mutating it
would silently break the deal animation, the drag order, and the
once-only celebration beat.

## Locked scope

1. **Split main.ts into focused modules.** The auditor's map is
   the starting point — `fx.ts` (animation/effects), `persist.ts`
   (score save/load), `banner.ts` (round/match summaries + the
   instant-win beat), `hand.ts` (hand rendering, selection, drag)
   — with `main.ts` remaining as the composition/entry module.
   Equivalent names/boundaries are acceptable if argued in the
   build report; one giant file renamed is not a split.
2. **Explicit round/trick identity.** The controller exposes an
   explicit `roundId` and `trickId` (monotonic counters or
   equivalent), and the UI keys the deal animation, drag order,
   and the once-only beat off those IDs — never off state/summary
   object identity.
3. **The inline `opacity` style** the pile history uses
   (main.ts:1143, audit #17) moves into CSS.

## Hard boundaries

- **Zero behavior change.** Same DOM at every state, same
  animations and timings, same log lines, same scores, same save
  behavior. This is a refactor: any observable difference is a
  defect, not a design choice.
- No locked design, rule, copy, or CSS visual changes (moving the
  one inline opacity value into a CSS rule with the identical
  computed value is the only styles touch).
- No other audit finding is in scope (no dedup #15, no null-leader
  #16 — those are a later task).

## Proof bar

- Full suite passes. Tests may be re-pointed at new module paths
  where they import internals; every such move is a numbered
  disclosure, and no assertion may change meaning. Count never
  drops below 122, zero `any`, strict stays on.
- **Seeded equivalence:** autopilot matches on fixed seeds play
  identically before/after — same play sequence, same log, same
  final scores (the repo's seeded-equivalence method, as for rule
  changes; this refactor touches the identity those behaviors
  hang on, so it earns the same evidence bar).
- Option C probe: screenshots at the key states (start, first
  turn, a bombhot comeback — seed 38 replay, instant-win beat —
  seed 101 or 56, round-over banner, match over) compared against
  the pre-split build at the same seeds; differences reported
  pixel-level, not eyeballed.
- The build report states the new module map, what each module
  owns, and where roundId/trickId are produced and consumed.
