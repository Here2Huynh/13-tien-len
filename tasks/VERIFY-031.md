# VERIFY 031 — match-score persistence in local storage (PR #30)

Verifier: independent session (the Verifier chat, Switch #6). You
did not write this code. Judge the PR against TASK-031 (as
amended: validation band −99..12, John's option A ruling) and the
claims in the PR body; do not fix anything. Post PASS or FAIL
with per-item evidence as a PR comment and report the verdict in
your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head (`e21f7f3`).
   `npm test` = 112/112, `npm run build` clean, tree clean
   afterwards.
2. **Diff discipline.** Exactly four files vs main:
   `src/main.ts`, `src/ui/controller.ts`, `test/app.test.ts`,
   `test/e2e.test.ts`. Engine zero diff. Confirm by reading the
   diff: persistence lives in main.ts (key
   `thirteen.matchScore.v1`) plus the controller's optional
   `MatchSeed` on `newMatch`; no seed = unchanged behavior; every
   storage access is wrapped so a throwing `localStorage` cannot
   break a render or a click; the start screen gains no new UI.
3. **Test-diff audit.** Exactly 7 new tests (+2 app, +5 e2e),
   no removed or weakened assertions, with ONE disclosed
   exception to judge explicitly: the corrupt-save test judges a
   *fresh-start shape* (0–0 at round 1, or +6/−2/−2/−2 at round
   2) rather than 0–0 literally, because a fresh deal can itself
   be an instant win. Accept only if the discard itself is still
   genuinely asserted (the planted save does not restore) and the
   reasoning holds. Confirm the band pins are real: −99 and 12
   restore; 13 and −100 are discarded; corrupt JSON and wrong
   shapes are discarded and removed.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probe with a PERSISTENT browser context on the BUILT dist:
   play a round to a nonzero board WITH negative seats; confirm
   the save under `thirteen.matchScore.v1` holds exactly
   `{scores, round}`; reload — Start restores points and round
   exactly; open a NEW page in the same context — restored
   exactly again; click New Match — save gone, reload shows 0–0
   round 1. Separately plant a `{scores:[0,0,0,13], round:7}`
   save and a corrupt-JSON save: both discarded, fresh board,
   no crash. Confirm a restored match keeps scoring on top of
   the restored values (zero-sum accumulation into the next
   round).
5. **No collateral.** A full autopilot match completes on the PR
   build; the storage-throwing case still plays (suite pin plus
   your own judgement of the wrapping); a match-end board clears
   the save so a finished match never restores; "chop" appears
   0 times in dist player-facing strings. The disclosed
   mid-round 13+ edge (a save written while a seat is 13+
   mid-round is discarded on read, self-healing at round end)
   is accepted design under option A — do not fail it; do
   confirm it behaves as disclosed if your probe reaches it.
