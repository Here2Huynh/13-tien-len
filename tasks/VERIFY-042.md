# VERIFY-042 — checklist for the verifier (Task 042)

Verify PR for TASK-042 at its head. You did not write this code. Builder
report + evidence live in the run folder named in the assignment.

1. Independent run: fresh clone at the PR head; npm test all pass
   (count >= 166), npm run build clean.
2. Diff discipline: changes confined to banner rendering (src/dom/
   banner.ts and/or the banner markup/styles) and tests. Engine,
   controller scoring paths, and persist zero diff — or any exception
   is disclosed in the build report and justified against the task's
   stop-and-flag rule.
3. Test-diff audit: no existing assertion removed or loosened; moved
   assertions, if any, correspond to the approved note-row rendering
   and are listed in the build report.
4. Reconciliation (decisive): over seeded rounds that include mid-round
   bomb penalties of both kinds (a bombed 2; a beaten bomb), read the
   rendered banner data: for every seat, previous + ROUND + note ==
   TOTAL. Include a round where one seat both paid and received, and a
   round with no penalties (no note lines anywhere). An instant-win
   round reconciles too.
5. Copy: the note uses "Bomb penalty" wording; the word "Chop" appears
   in no player-facing string (grep the built page + log/banner copy);
   per-seat possessives are correct (your/her/his/her).
6. Locked layout intact: PLACE / PLAYER / TOTAL / ROUND columns,
   medals, ordering, and banner timings unchanged (diff the banner
   structure against main; Task 032/033 tests still pass unmodified).
7. Equivalence: seeded full match vs main — identical plays, scores,
   outcomes; presentation-only (final state identical with the note
   rows suppressed).
8. Option C probe (patched Chrome for Testing 156.0.8078.80 only,
   localOnly, locally built dist on localhost, fresh profile,
   scrollTo(0,0), sandbox OFF): capture a round-over banner from a
   seeded round with a mid-round bomb penalty — the note line is
   visible under the right player with the right amount, and the
   banner still fits its layout at desktop and 360x640.
