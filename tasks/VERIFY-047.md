# VERIFY-047 — checklist for the verifier (Task 047)

Verify PR for TASK-047 at its head. You did not write this code.
Builder report + evidence live in the run folder named in the
assignment. This task touches tests, a fixture, and tools only —
production code must be byte-untouched.

1. Independent run: fresh clone at the PR head; npm test all
   pass, npm run build clean. Report the default suite's wall
   time and compare it to the ~31 s baseline (the bomb-odds
   enumeration no longer runs by default).
2. Diff discipline (decisive): the diff touches only test
   files, the checked-in fixture, and tools/ — `src/` has a
   zero-line diff. Any production change fails this item.
3. Fixture proven: re-run the full bomb-odds enumeration behind
   its env flag (allow the ~30 s) and confirm it reproduces the
   checked-in fixture exactly; the default test asserts the
   same expected values the old enumeration test asserted.
4. New coverage is real: the two-instant-win-hands test and the
   mid-round-13 test exist, and each FAILS when its behaviour
   is deliberately broken in a scratch copy (mutation spot-
   check) — a test that cannot fail does not count. The banner
   identity gap is either covered by a new test or the report's
   already-covered claim is confirmed against Tasks 042/046.
5. CSS comparison audit: no test asserts on CSS comment text,
   whitespace, or keyframe formatting; LOCKED values are still
   asserted as parsed values — spot-check the Task 034 gradient
   stops, one Task 037 measurement, and one Task 045 token.
   Deliberately corrupting one locked value in a scratch copy
   still fails the suite.
6. No weakening: no assertion anywhere in the diff is removed
   or loosened in strength; #21 conversions preserve the exact
   required values.
7. Probe script: `tools/probe/` (or the location the report
   names) runs under Option C rules (patched 156.0.8078.80,
   localOnly, locally built dist, fresh profile, sandbox OFF
   never claimed ON) and completes a smoke check with 0 page
   errors; it is not wired into npm test.
8. Equivalence: suite + a short seeded match run at the head
   produce outcomes identical to main (production untouched —
   anything else is a defect to report, not to fix here).
9. Docs accuracy: the env-flag invocation for the full
   enumeration and the probe script's usage are documented
   where a future verifier will find them (test file header /
   script header / README — as the report states).
