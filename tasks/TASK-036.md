# TASK-036: Split src/main.ts — structure refactor, zero behavior change

Status: IN VERIFICATION (PR #38) — filed 2026-11-04. Suite baseline: 122.
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

## VERIFY-036 — independent verification of PR #38, head `f30fc08`

Tested head is the PUSHED head `f30fc08` (contents identical to the
builder's local `a2a7560` — the API push re-created the commit).
Reconstruct `src/`/`test/` from the PR diff before testing. The
builder's evidence lives in ~/workspace/13tl-traces-036/ — re-derive
spot checks from it, don't just read its outputs.

1. **Suite and build, by your own run.** `npm test` (122+ expected)
   and `npm run build` in a fresh reconstruction of the PR head;
   report exact counts. Zero `any` in src/test; tsconfig strict
   untouched; the styles.css diff is exactly the one added rule.
2. **The split is real.** main.ts is composition-sized; the new
   modules own what the map claims; no import cycles (type-only
   imports don't count); no leftover dead code from the move
   (search for functions defined but never called in the moved
   code).
3. **Identity.** roundId/trickId exist on the controller state,
   increment where claimed (deal; trick clear), and every consumer
   the report lists actually keys off them. Grep the adapter for
   remaining object-identity round/trick checks — the only
   survivors should be the disclosed ones (match-object float key,
   DOM-node comparisons). Any undisclosed survivor fails here.
4. **Equivalence, spot-re-derived.** Run the builder's
   controller-level equivalence (or your own equivalent) on at
   least 3 seeds INCLUDING 38, and one page-level seed if the
   harness runs for you; confirm identical emits/logs/final scores.
   Optionally re-run one negative control to confirm the harness
   still bites.
5. **Probe states.** Re-run or independently pixel-compare at
   least 4 key states (start, seed-38 bombhot, an instant-win
   beat, a banner) base vs PR head; computed opacity of the
   "Before that" line is 0.65 on the PR build with no inline style.
6. **Disclosures.** All 10 build-report disclosures check out
   against the actual diff — in particular: no assertion changed
   meaning (read every test hunk), the fixture freshIds() values
   can't collide with real controller IDs, and nothing from
   another audit finding crept in.

PASS requires 1–6. Zero behavior difference is the bar: any
observable divergence you can reproduce is a FAIL with the state
and seed named.
