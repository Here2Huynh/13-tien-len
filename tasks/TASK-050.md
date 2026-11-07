# TASK-050: Bomb animation — "Shockwave"

Status: COMPLETE. PR #52 merged 97a9c88538cee66cf05658fef5db1a81590189fb
(merge method, expectedHeadSha ffa9e0aab209fb5f386700c508047a26b730700b);
verifier PASS on all 8 VERIFY-050 items (PR comment 6702396320);
deployed 0c40c8b0-c0fc-4562-8599-3eb50e6ac51c; live root index.html,
src/styles.css, src/main.js and src/dom/fx.js byte-match dist,
`shockwaveBomb` / `fx-shockring` signature live. Suite 187/187.
Suite baseline: 185.
Source: John's FR 2026-11-04 ("i want to have a animation for
bombs"). Animated mockups produced the same day
(~/workspace/13tl-mockups-bomb/: baseline + four variants on the
real game, seed-38 comeback bomb). **John picked A —
"Shockwave"** on 2026-11-04, over the foreman's recommendation
of D.

## Locked design — A "Shockwave" (the approved mockup)

- When a bomb play lands on the pile: **two gold shockwave rings
  expand outward from the played bomb cards** across the felt;
  the felt **brightens in a radial gold pulse**; the played cards
  **settle with a small overshoot bounce**.
- The reference is the approved mockup GIF
  (~/workspace/13tl-mockups-bomb/bomb-A-shockwave.gif — the
  seed-38 four-4s comeback over Rosa's 2♠, 360×640): match its
  motion language, colors (warm gold family only), and overall
  duration (~1.2–1.6s of aftermath inside the normal turn flow).
- Fires for **every bomb play** — human and CPU plays, led bombs,
  answers, and comeback bombs (any play the engine/controller
  classifies as a bomb; the bomb-vs-bomb chain re-fires per bomb).
- Does NOT fire for non-bomb plays, and adds nothing to instant
  wins beyond what a bomb play itself does (five consecutive
  pairs is an instant win, not a bomb — no shockwave).

## Hard boundaries

- **Presentation only.** Final game state/DOM identical with the
  animation on or off; no timing change to turn flow beyond the
  animation itself (it must not delay the next action's
  availability); game state, scoring, log unchanged — seeded
  equivalence of plays/logs/scores before/after.
- `prefers-reduced-motion`: the shockwave does not run (cards
  land plainly, as today).
- Existing effects keep their behavior: the golden foil, the
  bomb-penalty float, the LOCKED stamp, the pile pulse. The
  shockwave layers with them, it doesn't replace them.
- Suite floor = the count when this task starts; zero `any`;
  strict on.
- Mockup implementation notes for the builder (from the mockup
  capture): effects must anchor on layout (offset) geometry —
  at the landing render the pile minis are mid-FLIP — and the
  trigger needs care not to fire on the previous play's minis.

## Proof bar

- Full suite + build green; a test pins that the shockwave
  triggers on bomb plays only (a bomb play renders the effect;
  a non-bomb play and a five-consecutive-pairs instant win do
  not).
- Seeded equivalence (plays/logs/final scores identical) on at
  least 3 seeds including 38.
- Option C probe: frame captures of the shockwave mid-expansion
  on the seed-38 comeback bomb (human) AND on a CPU bomb play;
  reduced-motion capture shows no shockwave; screenshots
  pixel-compared against the approved mockup's key frames for
  fidelity (rings from the cards, gold pulse), with differences
  reported honestly.
