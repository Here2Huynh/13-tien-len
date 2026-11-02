# VERIFY 023 — card hover/select drop fix (PR #27)

Verifier: independent session (the Verifier chat — the fresh Claude
usage check at verify time failed with an HTTP 429 from the usage
endpoint, so availability was unproven and the chat fallback runs
this verification, per the owner's rule). You did not write this
code. Judge the PR against TASK-023 and the claims in the PR body;
do not fix anything. Post PASS or FAIL with per-item evidence as a
PR comment and report the verdict in your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head.
   `npm test` = 103/103 (102 + exactly 1 new test), `npm run build`
   clean, tree clean afterwards.
2. **Diff discipline.** Exactly three files vs main: src/main.ts,
   src/styles.css, test/e2e.test.ts. src/engine/ zero diff.
   styles.css diff = ONLY the one added reduced-motion line
   (`.hand .card{transition:none !important}` inside the
   prefers-reduced-motion block). No pose values changed anywhere:
   rest tilts, hover `translateY(-7px) rotate(0) scale(1.05)`,
   selected `translateY(-15px)`, and the shared
   `transform .13s ease` transition all identical to main; the
   `@media (hover:hover) and (pointer:fine)` guard intact.
3. **Test-diff audit.** The Task 019 hand-motion test's transition
   count goes 2 -> 3 for exactly the new rule; its restructured
   assertions are at least as strong as before (read both versions);
   exactly ONE new test exists — the non-zero-box settle test the
   task file requires; no other assertion removed or weakened.
4. **Same-element proof.** The hand's card buttons persist across
   selection renders: demonstrate element identity by card id
   across a select/deselect render pair (the suite's fake-DOM
   assertions, or your own real-app probe holding a node reference
   across the click).
5. **Real-app traces — the decisive item.** Your OWN Playwright /
   headless-Chromium traces on the BUILT dist (per-frame rAF
   sampling of the tracked card's painted top vs its rest top):
   desktop hover->select->deselect; phone-viewport tap
   select/deselect; Hint with nothing selected; Clear after a
   selection; Sort with a card selected (computed transform lift
   constant on every frame); a select under emulated
   prefers-reduced-motion (zero running animations, card still
   selects and lands). Criterion on every path: no downward
   reversal > 0.5 px mid-glide and the card never goes below its
   rest position. Control: the same tap-select trace against MAIN
   reproduces the dip (>= 10 px below rest), proving the harness
   can see the bug it is clearing. (Trace hygiene from the build:
   take baselines after the deal stagger fully settles; park the
   mouse off the hand before Hint/Clear measurements.)
6. **Deviation judgment.** The PR discloses that the reused
   buttons' click handler re-renders a tracked "last painted
   state" rather than `controller.state` literally. Read the code
   path; confirm every production render derives from the
   controller (so the two are identical in production) and the
   flicker tests still pass. Give an explicit verdict on the
   deviation: accept or reject, with the reason.
7. **Game integrity.** A full autopilot match completes on the PR
   build with sane final state; drag still works (suite drag tests
   green; a real-app drag if your harness supports it); the word
   "chop" appears 0 times in dist player-facing strings.
