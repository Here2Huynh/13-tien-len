# TASK-049: Restore the mid-round pile-collect animation

Status: QUEUED (after the audit batch; files in pipeline order).
Suite baseline: 122.
Source: found by the TASK-036 verifier, 2026-11-04 — a
pre-existing defect present on base and head alike. **John ruled
"Fix it — restore the mid-round collect" on 2026-11-04.**

## The defect (verified by the 036 verifier)

The TASK 014 pile-collect ghost — the pile's mini cards animating
to the trick winner when a trick clears mid-round — **never
fires in production**. The engine sets `trick.lastPlayer = null`
when a trick clears (`src/engine/trick.ts:144`), and the adapter
reads `trick.lastPlayer` afterwards as the collect winner
(`src/dom/fx.ts:368`, pre-split `main.ts:437`), gets `null`, and
skips the collect. Measured: seed 101 has 182 mid-round trick
clears and **0** ghost animations. Only the round-end collect
(keyed on phase) plays.

## Locked scope

1. **The mid-round collect fires again:** when a trick clears
   mid-round, the pile minis animate to the actual trick winner,
   with the TASK 014 collect's existing look and timing.
2. **The winner must be the real winner** — captured from the
   play/pass sequence that completed the trick (controller or
   adapter level; builder's choice, argued in the report), never
   re-derived from state the engine has already cleared.
3. Round-end collect behavior unchanged. No other animation,
   timing, or visual change.

## Hard boundaries

- **Presentation only.** No game-state, scoring, log, or outcome
  change: seeded autopilot matches produce identical plays,
  logs, and final scores before/after (the repo's seeded
  equivalence method).
- `prefers-reduced-motion` still suppresses the animation.
- Suite floor 122; zero `any`; strict on.

## Proof bar

- **A regression test that fails on current main:** a seeded
  autopilot match with known mid-round trick clears asserts the
  collect now fires (ghost/animate calls > 0 mid-round, targeted
  at the correct winner's seat) — the 036 page-equivalence
  harness pattern (recording fake DOM) is the model.
- Seeded equivalence of outcomes (plays/logs/scores) before vs
  after, at least 3 seeds including 101.
- Option C probe: a mid-round trick clear captured with the
  collect in flight or completed (ghost present / pile cleared
  toward the winner), plus confirmation the round-end collect
  still plays.
- Full suite + build green.
