# TASK-039: Save only at round end + Resume signpost (audit #10 + #28)

Status: COMPLETE — PR #41, merged e4e5c84 (final head 8eb236a
after one test-only fix loop), deployment
5340c807-2353-4023-80e4-6d6f9be9f2ad. Suite 134 → 142. Built by the Builder chat (Switch #9
fallback: fresh usage gate at assignment 2026-11-04 ~19:00 PT
showed the Claude 5h window at 100% used, resetting 20:09 PT,
so the build runs in the Thirteen Builder chat; the Claude
route was not available for this launch). Suite baseline 134.
Source: Task 035 audit findings #10 and #28 — both picked by
John in the walk-through (2026-11-04: #10 "save only at round
end", #28 "Resume button with round + scores").

## The defects (audit #10 + #28, verified against the code)

**#10 — the score save is silently thrown away.** The save is
written on every state change while no winner is decided, but
a mid-round bomb penalty lands on the scores immediately, and
the save parser rejects any score above 12 and then clears
the save. A penalty that takes a seat to 13 mid-round is
therefore written and then rejected: a reload at that moment
loses the whole match. The same mid-round persistence causes
the related half-state effects: a mid-round reload keeps the
round's bomb penalties but re-deals the round (a bad hand can
be dodged), and the restored round is led by the 3♠ holder
rather than last round's winner. (The −99..12 validation band
itself was John's Task 031 pick and does NOT change — saving
only at round end means a >12 score is never in a save to be
rejected: first-to-13 is checked at round end, and a match
that ends is over, not resumed.)

**#28 — restoring isn't signposted.** The start screen's
Start button silently restores saved standings, and the
restored match's log opens with "New match — first to 13."
while showing a later round and the saved scores.

## Locked scope

1. **Persist only when a round lands:** the score save is
   written only at the round-end / match-end phase — never
   mid-round. A mid-round reload therefore returns to the
   last completed round's standings (the in-progress round
   simply restarts from its deal state as the save defines
   it), with no kept-penalties-but-redealt half-state.
2. **No silent loss:** a save written by the game is always
   a save the game will accept back. In particular the
   mid-round-penalty-to-13 sequence can no longer produce a
   written-then-rejected save.
3. **Resume signpost:** when a save exists, the start screen
   offers a Resume control labeled with the saved round and
   scores (e.g. "Resume — Round 4 · You 5 · Mina −2 · …")
   alongside the New match control. Choosing New match
   starts fresh (and clears/replaces the save as today);
   choosing Resume restores the saved standings.
4. **Honest restore copy:** a restored match no longer opens
   its log with "New match — first to 13." — the opening line
   reflects a resumed match (round + standings), while a
   genuinely new match keeps the existing line.

## Hard boundaries

- Task 031's save format and validation band (−99..12) do
  not change; scores-only persistence stays (no hands, no
  mid-round state added to the save).
- Scoring, bomb penalties (instant, mid-round, on the live
  scoreboard), and the first-to-13 round-end check do not
  change — only WHEN the save is written.
- No-save and match-over behavior unchanged: with no save,
  the start screen is exactly as today (no Resume control);
  when a match ends, no resumable save remains.
- Suite floor 134; zero `any`; strict on.

## Proof bar

- Full suite + build green, including NEW tests: save not
  written mid-round (incl. during a mid-round bomb penalty);
  save written at round end with the round's final scores;
  the audit's repro sequence (penalty takes a seat to 13
  mid-round) no longer loses the match on reload; Resume
  control present iff a save exists and labeled with round +
  scores; New match from the start screen starts at round 1,
  0-0; restored-match opening log line is the resume line.
- Option C probe: play into round 2+, reload mid-round, and
  show the start screen offering Resume with the correct
  round + scores; resume and confirm the standings and round
  are the last completed round's; zero page errors.
- Equivalence: seeded autopilot match outcomes (plays,
  scores, winner) identical before/after — this task changes
  persistence timing and start-screen copy only.
