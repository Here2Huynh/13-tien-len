# VERIFY-039: Round-end saves + Resume signpost — independent verification checklist

Verify PR #41 at its head against TASK-039 (audit #10 + #28).
Builder claim: saves are written only at round end; a mid-round
reload restarts the round at the last completed scores; the start
gate offers a Resume button naming the round and all four scores
when a valid save exists. Suite 134 → 142.

1. **Independent run.** Fresh checkout of the PR head; `npm test`
   (expect 142, all pass), `npm run build` clean; tree clean after.
2. **Diff discipline.** 9 files: `index.html`,
   `src/dom/elements.ts`, `src/dom/persist.ts`, `src/main.ts`,
   `src/ui/controller.ts`, `src/ui/model.ts`, `test/app.test.ts`,
   `test/e2e.test.ts`, `test/persist.test.ts` (new). Engine
   (`src/engine/`) untouched. No game-rule or scoring change: the
   only behavioral changes are WHEN the save is written and the
   start-gate signpost.
3. **Save semantics, from the code + tests.** Confirm: (a) no code
   path persists a score mid-round (search every persist call site
   and trace when each fires); (b) a save whose round ended with a
   seat at 13+ (match over) loads as match-over, not discarded;
   (c) a mid-round bomb penalty does NOT survive a reload — the
   round restarts at the last completed standings; (d) New Match
   still clears the save (both start-gate paths and the header /
   menu New Match paths).
4. **Test-diff audit.** New `test/persist.test.ts` covers the save
   lifecycle. Disclosure 1: three TASK 031 e2e tests now click
   Resume instead of Start — read those diffs and judge: no
   assertion weakened, the change is forced by the new gate (Start
   with a save present no longer silently resumes). Any other
   modified assertion is a red flag — enumerate them.
5. **Probe (Option C, patched CfT 156.0.8078.80 only, localOnly,
   localhost dist only, fresh profile, sandbox OFF — do not claim
   ON).** On the PR dist: (a) with NO save, the gate shows the
   plain Start (no Resume); (b) play into round 2, read the saved
   standings from localStorage, reload mid-round — the gate offers
   "Resume — Round 2 · …" with exactly the last completed round's
   scores (compare against the save bytes); (c) Resume starts
   round 2 at those standings with a fresh deal (the interrupted
   round's penalties gone); (d) the save in localStorage is
   byte-identical before and after mid-round play (no mid-round
   writes) and changes exactly at round end; (e) one full
   autopilot match completes, 0 page errors.

Verdict: PASS or FAIL per item, with evidence.
