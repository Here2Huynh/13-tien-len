# VERIFY 029 — medals for 1st and 2nd place (PR #31)

Verifier: independent session (the Verifier chat, Switch #6). You
did not write this code. Judge the PR against TASK-029 (owner's
pick: top two only — gold for 1st, silver for 2nd; 3rd/4th keep
the green pill) and the claims in the PR body; do not fix
anything. Post PASS or FAIL with per-item evidence as a PR
comment and report the verdict in your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`f7af247`). `npm test` = 113/113, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly three files vs main:
   `src/main.ts`, `src/styles.css`, `test/e2e.test.ts`. Engine
   zero diff. Confirm by reading the diff: in
   `renderScoreboard`, only finish places 1 and 2 change —
   place 1 renders a `medal gold` span with text "1", place 2 a
   `medal silver` span with text "2", each `role="img"` with
   `aria-label` "Finished 1st" / "Finished 2nd"; places 3–4
   still render the existing `badge done` pill; the "Passed"
   badge and the "Finished Nth" meta line are untouched; the
   medal is sized to the pill's footprint (19px) so the
   scoreboard layout does not shift; no emoji; no animation
   introduced (nothing for reduced-motion to gate).
3. **Test-diff audit.** Exactly 1 new test, no removed or
   weakened assertions anywhere. The new test must genuinely
   pin: 1st = `medal gold` "1" + aria name, 2nd = `medal
   silver` "2" + aria name, 3rd/4th = `badge done` with the
   original ordinal text and no aria-label, the shipped medal
   CSS (disc size/radius, both gradients, the ribbon
   gradient), and the unchanged `.badge.done` rule. Judge the
   builder's disclosed first-run failure (a wrong relative CSS
   path in the test itself, since fixed) — accept only if the
   shipped test reads the real `src/styles.css` and passes in
   isolation and in the full suite.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probe on the BUILT dist, using the patched harness pattern
   (Chrome for Testing 156.0.8078.80, sandbox ON, never
   `--no-sandbox`, localhost/file only): finish a round and
   read the scoreboard DOM — 1st seat carries `medal gold`,
   2nd `medal silver`, 3rd/4th the green `badge done` pills.
   Take a phone-size screenshot (390×844) of a finished round's
   scoreboard and view it: gold and silver discs with the
   ribbon visible, 2×2 layout the same shape as before, zero
   page errors. Confirm the medals follow the PLACE, not the
   seat — whichever seat finishes 1st gets gold (the builder's
   screenshot has a CPU seat, Mina, in gold; reproduce or
   reason equivalently from your own run).
5. **No collateral.** A full autopilot match completes on the
   PR build; a mid-round scoreboard (unfinished seats, "Passed"
   badges) renders exactly as on main; "chop" appears 0 times
   in dist player-facing strings; no new animation or motion
   anywhere in the diff.
