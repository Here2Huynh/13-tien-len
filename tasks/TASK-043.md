# TASK-043: Instant-win match end — name the winner, show the winning hand (audit #6)

Status: COMPLETE — PR #45 merged d7fe797 (verifier PASS, all 9
VERIFY-043 items, head da96624), deployed 1ceb0a14-314a-4aef-aae3-8f60965969b5.
Suite 171 -> 174.

## Why

Task 035 audit finding #6 (LOCKED banner/beat — owner's call made):
a match decided by an instant win is titled just "Match over!",
while a normal end names the winner ("🏆 Kenji wins the match!").
And neither the Task 033 celebration beat nor the banner shows the
winning hand — the cards are gone from the DOM under the banner, so
you never see the four 2s that just cost you 2 points, or even your
own six pairs.

Owner ruling (2026-11-04 walk-through): the FULL fix — winner named
+ winning hand shown in the beat.

## Scope
- When a match ends on an instant win, the match-over banner title
  names the winner, in the same form as a normal match end
  ("🏆 <Name> wins the match!"). A round-level instant win that does
  NOT end the match keeps the existing banner title ("Instant
  win!"), the Task 033 beat/banner layout, and all beat/banner
  timings exactly as-is — the winning-hand display in the next
  bullet applies to it as well (owner ruling 2026-11-05, option A:
  the hand shows in EVERY instant-win beat).
- The winning hand (the dealt instant-win hand: four 2s, six pairs,
  five consecutive pairs, dragon straight 3–A, or three consecutive
  triples) is shown as cards during the instant-win celebration
  beat — every instant-win beat, round-level and match-ending alike
  (owner ruling 2026-11-05, option A) — so the hand that ended it
  is visible before the banner.
  The beat's existing timings, skip behavior, and reduced-motion
  handling stay as Task 033 locked them; the cards ride the beat,
  they do not extend it.
- The banner itself keeps its locked Task 032/042 layout (columns,
  medals, note rows, timings) — the only banner change is the
  match-end title above.

## Non-goals
- No engine, scoring, rule, or save change. The instant-win
  detection and payouts are correct today; if the winning hand's
  cards are not recoverable from existing state at render time,
  STOP and flag it in the build report instead of patching the
  engine quietly.
- No change to normal (non-instant-win) match ends or round ends.

## Rules
- Strict TS, zero `any`; suite count never drops; no existing
  assertion removed or loosened without a build-report disclosure.
- Presentation-only: seeded full-match equivalence vs main —
  identical plays, scores, outcomes; only the beat/banner
  presentation of instant wins differs.
- Player-facing vocabulary: "Bomb penalty" only; the word "Chop"
  appears in no player-facing string.
- Option C probes: patched Chrome for Testing 156.0.8078.80,
  localOnly, locally built dist, fresh profiles, sandbox OFF.
  A full autopilot match takes ~35 min and outlives tool caps —
  use short seeded/scripted probes, never a full-match probe.

## Acceptance
- VERIFY-043 items all pass.
