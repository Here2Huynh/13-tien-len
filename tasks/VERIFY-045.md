# VERIFY-045 — checklist for the verifier (Task 045)

Verify PR for TASK-045 at its head. You did not write this code.
Builder report + evidence live in the run folder named in the
assignment.

1. Independent run: fresh clone at the PR head; npm test all pass
   (count >= 178), npm run build clean.
2. Diff discipline: changes confined to styles/presentation and
   tests. Engine, controller logic, and persist zero diff — or any
   exception is disclosed in the build report and justified.
3. Test-diff audit: no existing assertion removed or loosened
   except CSS pins updated to the new shades/sizes, each listed in
   the build report; Task 032/033/037/042/043 banner, beat, phone,
   and note tests pass.
4. Contrast (decisive): computed from the built CSS (not the
   builder's claim), the Play green, the blue, and the Pass red
   each meet WCAG AA for the text/UI they carry — state the ratio
   and the threshold applied for each. Each new shade is
   recognizably the same hue family as the one it replaces.
5. Touch targets (decisive): probe-measured action buttons are
   >= 44px targets; the CPU card-count text renders larger than
   10.5px and is legible in a 360x640 capture.
6. Reduced-motion foil: with prefers-reduced-motion emulated, a
   bomb card shows NO foil layer; without it, the foil renders as
   on main and the Task 034 V1 gradient stops in the built CSS are
   byte-identical to main's.
7. Desktop fit: at 1280x640 and 1440x700 the full stage including
   the player's hand is visible without page scrolling; card and
   table proportions are undistorted (compare geometry against a
   main capture at a tall viewport).
8. No regressions: the Task 037 phone one-screen layout at 360x640
   still fits (pile 144px, one-row actions, no page scroll); the
   Task 044 speed/skip controls still work; seeded full-match
   equivalence vs main — identical plays, scores, outcomes, logs.
9. Option C probe: patched Chrome for Testing 156.0.8078.80,
   sandbox OFF (never claimed ON), localOnly with all external
   requests blocked, locally built dist, fresh profiles: desktop
   tall + short, phone 360x640, and a reduced-motion scenario —
   0 page errors. Short seeded/scripted probes only; a full
   autopilot match (~35 min) outlives tool caps — do not attempt
   one.
