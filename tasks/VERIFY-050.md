# VERIFY-050 — checklist for the verifier (Task 050)

Verify PR #52 for TASK-050 at head
ffa9e0aab209fb5f386700c508047a26b730700b (push-files snapshot
of builder commit bdf6bd8; the foreman verified the three code
files are blob-identical to the builder commit, and the verify
clone's tree matches the builder clone except tasks/TASK-049.md,
which carries main's later deployment-id docs correction).
You did not write this code.

1. Independent run: fresh clone at the PR head; npm test all
   pass (187: the 185 of current main plus Task 050's two new
   tests), npm run build clean, zero `any`.
2. Diff discipline: the PR diff vs main is exactly the claimed
   3 files (src/dom/fx.ts, src/styles.css, test/e2e.test.ts),
   purely additive (+232/−0); engine diff is zero lines — this
   is presentation-only.
3. Trigger correctness: the shockwave fires on bomb plays only.
   The new e2e tests pass at head; independently confirm the
   negative cases hold — no shock nodes on non-bomb plays or
   passes, and none on a five-consecutive-pairs instant win
   (seed 119) — and that a bomb-vs-bomb chain re-fires per bomb.
4. Equivalence: seeded full matches vs main — plays, logs, and
   scores byte-identical on at least 3 seeds including 38;
   the animation must not delay the next action's availability
   or change turn flow timing beyond itself.
5. Probe (decisive): Option C — patched Chrome for Testing
   156.0.8078.80, sandbox OFF (never claimed ON), localOnly,
   locally built dist, fresh profile. Frame captures of the
   seed-38 human comeback bomb mid-expansion: exactly 2 rings
   + 1 felt pulse, centered on the LANDED pile minis (not the
   cards' source — disclosure 1's anchoring fix is the thing
   being proven), nodes self-remove, 0 page errors, 0 external
   requests. A CPU bomb play fires the full set, CPU-attributed.
   Compare frames against the approved mockup's key frames
   (~/workspace/13tl-mockups-bomb/bomb-A-shockwave.gif) and
   report differences honestly.
6. Reduced motion: with prefers-reduced-motion, the shockwave
   does not run — zero shock nodes — and the final DOM/state
   is identical to the animation-on run.
7. Layering: existing effects keep their behavior alongside
   the shockwave — golden foil, bomb-penalty float, LOCKED
   stamp, pile pulse (the shockwave layers, it does not
   replace). Judge disclosure 3 on its merits: on a
   restore/resume first render a standing bomb fires the
   shockwave once, matching the pile pulse's existing
   precedent — accept or flag with evidence.
8. Disclosures judged: builder disclosures 1–5 in the PR body,
   each accepted or flagged with evidence — in particular
   disclosure 2 (mockup's ~1.04s of ring motion kept vs the
   task prose's 1.2–1.6s band, reached counting the landing
   FLIP overlap) and disclosure 4 (rings centered on the
   played cards' union box rather than the mockup's pile-box
   center).
