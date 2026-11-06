# TASK-041: Copy bundle — grammar, player-facing errors, How to Play (audit #5 + #7 + #8) + accessibility details (#18)

Status: ASSIGNED (verifier) — PR #43 open at head b7e507c (local commit
5583bac; builder died post-commit, BUILD-REPORT reconstructed by the foreman
per Disclosure 1). Suite 151 → 166. VERIFY-041 filed.

## Why

Owner walk-through of the Task 035 audit (2026-11-04): #5, #7 and #8 build as
one copy bundle; #18 (accessibility details) rides with it. All presentation
and copy — no rule, engine, or scoring change anywhere in this task.

## Scope

### #5 — Player-facing grammar
- Log/announcement lines for the human seat conjugate correctly: "You play /
  You pass / You lead / You take it / You were dealt" (audit found "You plays /
  passes / leads / takes it / was dealt" at controller.ts:336, 370, 395, 399,
  425 and the instant-win banner line).
- Reuse the existing human-seat conjugation helper (model.ts:131, 145) rather
  than adding a second one.
- The instant-win banner line keeps its locked wording; only the grammar is
  fixed ("You were dealt an instant-win hand…").

### #7 — Errors read like guidance, and look like errors
- Engine rejection strings are mapped to player copy that names what is on
  the table where the state allows it (audit example: "Beat single 3♠ with a
  higher single — or Pass."). At minimum cover the known strings: "Play does
  not beat the current trick play", "A bomb cannot be led", the comeback
  requirement string, "Select at least one card first." — punctuation
  consistent (full stops).
- The mapping lives in the presentation layer; engine strings and engine
  behavior are unchanged. An unmapped error falls back to the engine text.
- Errors get a visually distinct style from hints in #message (today both
  render identically).

### #8 — How to Play agrees with the engine, and closes sanely
- Pair runs: How to Play must not list pair runs among the leadable/playable
  sets — a pair run plays only as a bomb. Wording matches the engine and the
  locked bomb rules.
- Leftover points line: in a played-out round the leftover points go from
  last place to 1st (locked rule; scoring.ts) — replace the "player above
  you" wording accordingly.
- Naming consistency: "Five consecutive pairs" everywhere (sheet and odds
  card agree).
- The sheet gains a top close control and closes on Esc (today: Close only at
  the bottom of a 1,641px phone scroll, no Esc).

### #18 — Accessibility details
- Sort button aria-label: the descending label currently reads "…tap to sort
  high to low ascending" — fix to "low to high".
- Overlays (How to Play, Bomb odds; the Task 040 confirm dialog already has
  this — keep it consistent, do not regress it): role="dialog",
  aria-modal="true", focus moves into the overlay on open, Esc closes, focus
  returns to the opener on close. Reuse the confirm dialog's pattern/helpers
  where practical rather than building a second focus system.
- The table-talk log becomes aria-live="polite" (new entries announced);
  #message keeps role="status".

## Non-goals
- No engine, rule, scoring, save, or AI change. No colors (#11 is Task 045),
  no target sizes (#12 is Task 045), no layout change beyond the How to Play
  close control.
- Locked copy elsewhere (bomb-penalty wording, banner columns) is untouched.

## Rules
- Strict TS, zero `any` in src/ and test/; suite count never drops; no
  existing assertion removed or loosened without a build-report disclosure
  the verifier can judge (copy changes WILL move copy-pinning assertions —
  each moved assertion is updated to the new approved copy, listed in the
  report, and nothing else about the assertion changes).
- Seeded equivalence: a full seeded match on this build vs main produces
  identical plays, scores, and outcomes; only log/message/sheet text differs.
- Presentation-only check: game state identical with the new copy/styles on
  or off.

## Acceptance
- VERIFY-041 items all pass.
