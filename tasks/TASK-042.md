# TASK-042: Round-over banner — bomb-penalty note rows (audit #4)

Status: COMPLETE — PR #44 merged 0d2bbaf (verifier PASS, all 8
VERIFY-042 items, head a4eeca3), deployed 8f66c8bf-e72e-4525-b04d-6e37dd67bb66.
Suite 166 -> 171.

## Why

Task 035 audit finding #4: the round-over banner's ROUND column leaves out
mid-round bomb penalties, so TOTAL often != previous + ROUND and nothing
explains the gap (audit evidence: "Mina: prev 0 + round 1 != total 2;
Kenji: prev -2 + round -2 != total -5"). The data already exists —
RoundSummary.chops is filled in by the controller and never rendered.

Owner ruling (2026-11-04 walk-through): bomb-penalty NOTE ROWS UNDER EACH
PLAYER in the banner. The ROUND column itself stays exactly as locked in
Task 032 (mockup A: PLACE / PLAYER / TOTAL / ROUND columns + medals).

## Scope
- In the round-over banner, under a player's row, show a note line when
  that seat's net mid-round bomb-penalty points for the round are nonzero:
  the signed amount, worded with the locked player-facing term
  "Bomb penalty" (the word "Chop" appears in no player-facing string) and
  per-seat possessives where the copy names a seat (You -> your,
  Mina -> her, Kenji -> his, Rosa -> her).
- The note covers BOTH mid-round penalty kinds (a bombed 2 pays the
  bomber; a beaten bomb pays the beater) — i.e. the seat's full chops net
  for the round, so the banner reconciles: previous + ROUND + note =
  TOTAL for every seat, in every round, including rounds where a seat
  both paid and received.
- Seats with a zero net show no note line.
- Nothing else in the banner changes: columns, medals, ordering, timings,
  and the Task 033 instant-win beat are untouched. Instant-win rounds
  (payout at round end, no mid-round penalties beyond what chops records)
  must still reconcile.

## Non-goals
- No engine, scoring, rule, or save change. The chops data is already
  computed; if it proves incomplete for full reconciliation, STOP and
  flag it in the build report instead of patching the engine quietly.

## Rules
- Strict TS, zero `any`; suite count never drops; no existing assertion
  removed or loosened without a build-report disclosure.
- Presentation-only: seeded full-match equivalence vs main — identical
  plays, scores, outcomes; only banner rendering differs.
- The banner is a locked design (Task 032): keep the note visually
  subordinate (a note, not a fifth column).

## Acceptance
- VERIFY-042 items all pass.
