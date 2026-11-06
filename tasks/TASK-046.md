# TASK-046: One source of truth for rule predicates + honest leader typing (audit #15 + #16)

Status: ASSIGNED (builder). Suite baseline: 179.

## Why

Task 035 audit findings #15 and #16 — defect-risk cleanup, filed as
one task by the owner's walk-through ruling (2026-11-04), after the
behavior tasks:

- **#15 Duplicated rule predicates.** "Does this bomb answer the
  table?" was written out in four places (trick state, AI, and two
  adapter spots — comeback glow and bomb flicker, at audit time in
  main.ts; the files have since split under Task 036, so locate the
  current sites by the predicate, not by the audit's line numbers).
  "Did this play act as a bomb?" exists in both the controller and
  the adapter. The play -> bomb penalty -> bombed-bomb application
  sequence exists in both the runner and the controller. The next
  ladder ruling would have to change four or more sites in sync,
  and nothing fails if one is missed.
- **#16 `null` cast to `number` on leader paths.** The match leader
  is passed through `as number` casts even though it is `null` for
  a restored match; it only works because a downstream `typeof`
  check catches it. Same pattern on a trick-winner cast.

## Scope
- Export from the engine, and make every existing copy call them:
  - `legalBombs(state, player)` — the bomb-answer predicate.
  - `functionedAsBomb(prev, cards)` — the acted-as-a-bomb predicate.
  - `applyTurn(match, state, player, action)` — the single
    play -> penalties application sequence used by both the runner
    and the controller.
  Exact names may differ if the engine's existing conventions read
  better; what matters is ONE implementation per predicate,
  called from every former site (engine internals, AI, controller,
  runner, adapter glow/flicker).
- Make the leader explicitly nullable end-to-end (type
  `number | null` wherever that is the truth) and remove the
  `as number` casts on the leader and trick-winner paths. Add a
  test pinning who leads a round in a restored match — matching
  CURRENT behavior (the 3♠ holder leads; Task 039's save format is
  unchanged). This task makes the typing honest; it does not
  change who leads.

## Non-goals
- **Zero behavior change.** This is a pure refactor. If any
  "duplicate" turns out to differ subtly from the others, STOP and
  flag it in the build report instead of unifying the difference
  away — a divergence is a finding, not an inconvenience.
- No rule, scoring, save-format, UI, CSS, or player-facing string
  change. No new features.

## Rules
- Strict TS, zero `any`; suite count never drops; no existing
  assertion removed or loosened. Tests that must move or rename to
  follow the refactor get listed in the build report.
- Equivalence is the acceptance bar: seeded full matches vs main —
  plays, scores, per-round summaries, and full logs byte-identical
  across a seed set that includes bomb answers, comeback bombs,
  and bomb-vs-bomb chains (penalties reconcile identically).
- Player-facing vocabulary unchanged: "Bomb penalty" only.

## Acceptance
- VERIFY-046 items all pass.
