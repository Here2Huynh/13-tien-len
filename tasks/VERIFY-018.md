# VERIFY 018 — PR #20 (Task 018: bomb examples + playable-bomb flicker)

Status: ASSIGNED (verifier)
PR: #20, branch `task-018-bomb-flicker`, head `9c1cfa6` (confirm the
live head SHA matches before you start; if it moved, flag it).

You are the VERIFIER (see `AGENTS.md`). Fresh checkout of the PR head;
never edit code, never merge. Post your verdict — PASS or FAIL with
evidence — as a comment on PR #20.

Builder's claims to check, not trust: suite 76 (32 engine / 25 app /
19 e2e), up from 71, no assertion weakened; engine and controller
unchanged; build passes; flicker eligibility comes from the engine's
own bomb functions; reduced motion disables the flicker.

## Checklist

1. `npm install`, `npm test`, `npm run build` on the PR head. Report
   exact counts. Diff-inspect the test changes against `main`: the
   count must not drop and no existing assertion may be weakened or
   removed.
2. Diff scope: changes should be confined to the help overlay
   (`index.html`), hand-card styling (`src/styles.css`), the DOM
   adapter, and tests. ANY change under `src/engine/` or in
   `src/ui/controller.ts` fails this check — report it as a FAIL
   item. The builder disclosed exporting the adapter's render entry
   for the test harness: confirm that export changes no runtime
   behavior.
3. Part A — examples: the three example lines render inside the
   BOMBS BEAT 2s section of the help overlay; their facts match the
   locked ladder exactly (3-pair double run → single 2; 4-pair
   double run → pair of 2s; four of a kind → either). No other
   cheatsheet section changed. Grep player-facing strings: the word
   "Chop" must not appear.
4. Part B — flicker states, probed with your own harness (do not
   rely only on the PR's new tests). Flicker class present on
   exactly the bomb's cards in the human's hand when:
   - a single 2 is on the table (each bomb tier),
   - a pair of 2s is on the table (four of a kind and 4-pair run
     flicker; a 3-pair run must NOT),
   - a comeback turn (human passed earlier, now faces a 2 / pair of
     2s): four of a kind and 4-pair run flicker; a 3-pair run must
     NOT.
   Absent in all of: no play on the table (a held four of a kind
   that could be led does not flicker), triple 2s on the table, a
   non-2 target, a CPU's turn, after the human passes.
   Overlapping playable bombs: every eligible bomb's cards flicker.
5. Presentation discipline: a selected flickering card keeps its
   selected lift; under `prefers-reduced-motion` the animation is
   off and the final DOM/state equals the animated case; nothing in
   the change gates input or timers; CPU hands show nothing.
6. Non-vacuity spot-check: in a scratch copy, break one gate (e.g.
   the comeback eligibility) and confirm the new tests fail. Report
   what you mutated and what failed.

Verdict format: PASS or FAIL, then the evidence per item (counts,
commands, probe results). A FAIL lists the exact defects.
