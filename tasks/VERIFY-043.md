# VERIFY-043 — checklist for the verifier (Task 043)

Verify PR for TASK-043 at its head. You did not write this code. Builder
report + evidence live in the run folder named in the assignment.

1. Independent run: fresh clone at the PR head; npm test all pass
   (count >= 171), npm run build clean.
2. Diff discipline: changes confined to presentation (banner/beat
   rendering, styles) and tests. Engine, controller scoring paths,
   and persist zero diff — or any exception is disclosed in the
   build report and justified against the task's stop-and-flag rule.
3. Test-diff audit: no existing assertion removed or loosened; the
   Task 032/033/042 banner and beat tests pass unmodified, or any
   moved assertion is listed in the build report.
4. Winner named (decisive): in a seeded/scripted instant-win MATCH
   end, the match-over banner title names the winner in the normal
   form ("🏆 <Name> wins the match!") — for a CPU winner and, if
   reachable in the harness, the human seat. A normal match end is
   unchanged.
5. Winning hand shown: during the instant-win celebration beat of
   a match-ending instant win, the winner's dealt instant-win hand
   renders as cards — the exact cards of the hand (e.g. four 2s),
   verified against the deal. Beat timings, skip, and
   reduced-motion behavior match Task 033's locked values.
6. Round-level instant win unchanged: a mid-match instant win
   (match continues) shows the beat and banner exactly as on main —
   no winner-named match title, no hand display change.
7. Equivalence: seeded full matches vs main — identical plays,
   scores, outcomes; presentation-only (final state identical with
   the new title/hand presentation suppressed).
8. Banner integrity: Task 032 columns/medals, Task 042 note rows
   and reconciliation (previous + ROUND + note = TOTAL) still hold
   on the match-over banner; instant-win rounds still reconcile.
9. Option C probe: patched Chrome for Testing 156.0.8078.80,
   sandbox OFF (never claimed ON), localOnly with all external
   requests blocked, locally built dist, fresh profiles: an
   instant-win match end on desktop 1280×800 and phone 360×640 —
   winner named, hand visible in the beat, banner fits, 0 page
   errors. Short seeded/scripted probes only; a full autopilot
   match (~35 min) outlives tool caps — do not attempt one.
