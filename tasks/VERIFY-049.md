# VERIFY-049 — checklist for the verifier (Task 049)

Verify PR for TASK-049 at its head. You did not write this code.
The build was made on an old base and rebased onto current main
after the owner's 2026-11-06 ruling — rebase integrity is part
of what you are checking. Builder report + evidence live in the
run folder named in the assignment.

1. Independent run: fresh clone at the PR head; npm test all
   pass (count >= 185: the 183 of current main plus Task 049's
   two tests, or the count the build report explains), npm run
   build clean.
2. Regression is real: the Task 049 regression test FAILS on
   current main (the mid-round collect never fires there) and
   PASSES at the PR head.
3. Probe (decisive): Option C — patched Chrome for Testing
   156.0.8078.80, sandbox OFF (never claimed ON), localOnly,
   locally built dist, fresh profile, scrollTo(0,0) before any
   overlay capture. On a seeded game with mid-round trick
   clears (seed 101 or your own pick): at least one mid-round
   pile-collect ghost fires; every ghost's target is the seat
   that won that trick; the round-end collect still fires;
   0 page errors; zero external requests attempted (fonts are
   local since Task 048).
4. Mechanism audit: the collect winner is captured from the
   actual play sequence at trick clear (controller), not read
   from the engine's nulled trick state afterwards; the engine
   itself is zero-diff vs main — this is presentation-only.
5. Equivalence: seeded full matches vs main — plays, logs, and
   scores byte-identical on at least 3 seeds including 101.
6. Rebase integrity: the PR diff vs current main is only the
   Task 049 change. Nothing landed since the old base is
   reverted or altered — spot-check: Task 042 banner notes,
   Task 043 hand-in-beat, Task 044 Fast/Skip, Task 045 foil +
   shades, Task 046 single-source predicates, Task 047 fixture
   + parsed CSS pins, Task 048 fonts/modulepreload all present
   and behaving.
7. Reduced motion: with prefers-reduced-motion, no collect
   animation runs and the final DOM/state is identical to the
   animation-on run.
8. Diff discipline: no rule, scoring, save-format, or
   player-facing string change; "Bomb penalty" wording
   untouched; suite count never drops.
