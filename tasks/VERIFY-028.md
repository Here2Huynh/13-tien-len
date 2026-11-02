# VERIFY 028 — LOCKED stamp plays once per lockout (PR #28)

Verifier: independent session (the Verifier chat, Switch #6). You
did not write this code. Judge the PR against TASK-028 and the
claims in the PR body; do not fix anything. Post PASS or FAIL with
per-item evidence as a PR comment and report the verdict in your
chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head.
   `npm test` = 105/105 (103 + exactly 2 new tests),
   `npm run build` clean, tree clean afterwards.
2. **Diff discipline.** Exactly three files vs main: src/main.ts,
   src/styles.css, test/e2e.test.ts. src/engine/ zero diff. The
   CSS diff is the animation move only: the base
   `.seat.lockedout .opp::after` rule keeps the full LOCKED look
   with no `animation:` property; the new gated rule
   `.seat.lockedout.stampplay .opp::after` carries exactly
   `stampIn .28s cubic-bezier(.2,1.4,.4,1) both`; `@keyframes
   stampIn` byte-identical to main; the reduced-motion selector
   swap is the disclosed one and nothing else in that block
   changed. The main.ts diff is limited to the lock-state /
   stampplay logic in renderSeat — the pass-flash code and its
   trackers are read, not modified, by the new logic (confirm no
   behavioral change to the flash: it still fires exactly once per
   newly-passed seat).
3. **Settled-look identity.** On a locked seat after the animation
   window, the stamp on the PR build is pixel-identical to main's
   (screenshot compare, same seed/state): content "LOCKED",
   same rotation/opacity/position; the greyed card backs
   unchanged.
4. **Real-app probes — the decisive item.** Your OWN Playwright /
   headless-Chromium probes on the BUILT dist, counting distinct
   stampIn Animation OBJECTS via the Web Animations API (not
   startTime keys — a pending animation reports startTime null):
   drive a real game to a CPU lockout — exactly 1 stampIn fires;
   then the owner's click battery on that locked seat (card
   select, deselect, Hint, Sort, Clear) — the count stays 1, no
   stampIn left running, and the stamp still renders settled;
   play on to a second lockout — exactly 1 more fires. Control:
   the identical battery against MAIN shows replays (the build's
   control read 2 -> 7), proving the witness can see the bug.
5. **Reduced motion.** Under emulated prefers-reduced-motion, a
   lockout shows the settled stamp with zero stamp animations,
   exactly as on main.
6. **No collateral motion changes.** The pass-flash still fires
   once per pass; Task 014's other fx (deal stagger, floats,
   settle) still fire in a played round; a full autopilot match
   completes with sane final state; "chop" appears 0 times in
   dist player-facing strings.
