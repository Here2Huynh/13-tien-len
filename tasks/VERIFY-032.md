# VERIFY 032 — round-over banner columns + medals (PR #35)

Verifier: independent session (the Verifier chat, Switch #8). You
did not write this code. Judge the PR against TASK-032 (John's
locked pick: mockup A with a separate PLACE column; medals folded
into the PLACE column per the 2026-11-02 amendment) and the claims
in the PR body; do not fix anything. Post PASS or FAIL with
per-item evidence as a PR comment on PR #35 and report the
verdict in your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`3474a90`). `npm test` = 120/120, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly 3 files vs main: `src/main.ts`,
   `src/styles.css`, `test/e2e.test.ts`. Engine zero diff.
   Presentation only: no scoring, engine, or game-state change;
   final game state identical with this change reverted.
3. **Test-diff audit.** Exactly 1 new test (119 → 120), zero
   removed or weakened assertions. The new test pins: subline
   text for rounds 1 and 2, the PLACE | PLAYER | TOTAL | ROUND
   headers, medal classes/aria per place, plain ordinals on
   3rd/4th, totals vs round gains, and penalty-row attachment
   under the payer's row.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probes on the built dist under the Option C harness rules
   (patched Chrome for Testing 156.0.8078.80 only, probes load
   only locally built dist over localhost/file, every probe
   route-blocks ALL external requests via localOnly, sandbox-OFF
   is the accepted state — never claim sandbox-ON):
   - A mid-match round-over at 390×844 where totals differ from
     round gains: subline "ROUND N · FIRST TO 13" present,
     four labeled columns, TOTAL with muted "/13" suffix,
     ROUND signed with pos/neg colors.
   - Medals: gold medal on the 1st-place row, silver on the
     2nd, plain ordinals on 3rd/4th — same `.medal gold` /
     `.medal silver` markup, classes, and aria-labels as
     Task 029's scoreboard component (shared helper, not a
     second medal style).
   - A round-over (or, if the hunt only reaches it, match-over
     via the shared renderer) with penalty note rows: notes stay
     attached directly under their payer's row in the new layout.
   - View the after screenshots directly.
5. **No collateral.** Task 027 banner fit preserved (banner fits
   360×640, scroll == client); instant-win banner variant keeps
   its existing content; Continue button and banner entrance
   unchanged; no new animation; a full autopilot match completes;
   "chop" appears 0 times in dist player-facing strings; zero
   page errors in probes.

Verdict format: PASS or FAIL, per-item evidence. A FAIL names
the exact failing items.
