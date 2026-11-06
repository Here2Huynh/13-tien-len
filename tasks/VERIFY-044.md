# VERIFY-044 — checklist for the verifier (Task 044)

Verify PR for TASK-044 at its head. You did not write this code. Builder
report + evidence live in the run folder named in the assignment.

1. Independent run: fresh clone at the PR head; npm test all pass
   (count >= 174), npm run build clean.
2. Diff discipline: changes confined to pacing (CPU delay/pass
   pacing, the speed setting, the skip control) and tests. Engine,
   AI policy, scoring, and persist zero diff — or any exception is
   disclosed in the build report and justified.
3. Test-diff audit: no existing assertion removed or loosened; the
   Task 032/033/042/043 banner and beat tests pass unmodified, or
   any moved assertion is listed in the build report.
4. Fast mode (decisive): with Fast on, measured CPU turn delay is
   ~250 ms (probe timestamps, not the source constant) and CPU
   passes resolve quicker than Normal; with Normal, pacing matches
   main (~650 ms). Switching mid-match takes effect on the next
   CPU action; the default on a fresh load is Normal.
5. Skip to end (decisive): in a seeded round where the human
   finishes while CPUs still hold cards, the skip control is
   offered; using it lands on the round-over banner with EXACTLY
   the plays, scores, penalties, and log the same round produces
   when played out in full (verifier's own comparison run). The
   control is not offered while the human is still playing.
6. Equivalence: seeded full matches vs main — identical plays,
   scores, outcomes at Normal, at Fast, and with skip used at
   every opportunity.
7. Locked timings intact: the Task 033 beat/banner timings, the
   Task 040 confirm freeze behavior, and animation durations are
   unchanged in both modes (Fast shortens CPU delays only).
8. Banner integrity: Task 032 columns/medals, Task 042 note rows
   and reconciliation (previous + ROUND + note = TOTAL), and the
   Task 043 instant-win title/hand presentation still hold.
9. Option C probe: patched Chrome for Testing 156.0.8078.80,
   sandbox OFF (never claimed ON), localOnly with all external
   requests blocked, locally built dist, fresh profiles: desktop
   1280×800 and phone 360×640 — the speed setting is reachable
   and switchable, Fast pacing measures fast, the skip control
   appears once the human is out and lands on the banner, 0 page
   errors. Short seeded/scripted probes only; a full autopilot
   match (~35 min) outlives tool caps — do not attempt one.
