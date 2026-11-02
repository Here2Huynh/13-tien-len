# VERIFY 030 — start-screen Bomb Odds button removal (PR #29)

Verifier: independent session (the Verifier chat, Switch #6). You
did not write this code. Judge the PR against TASK-030 and the
claims in the PR body; do not fix anything. Post PASS or FAIL with
per-item evidence as a PR comment and report the verdict in your
chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head.
   `npm test` = 105/105, `npm run build` clean, tree clean
   afterwards.
2. **Diff discipline.** Exactly three files vs main: index.html
   (−1 line: the odds-btn-start button), src/main.ts (−2 lines:
   the lookup and its click binding), test/e2e.test.ts. Engine
   zero diff. The header odds binding, `setOdds`, the overlay
   markup, and the odds figures are untouched — confirm by diff,
   and confirm a repo-wide grep for `odds-btn-start`/`oddsStart`
   in src/ and the built dist/ returns zero.
3. **Test-diff audit.** Read the restructured Task 022 test in
   both versions: the removed assertions are exactly the
   start-screen ones; the header open/close cycle and the odds
   figure pins survive at full strength; the new TASK-030 pin is
   present and actually asserts absence (an element lookup that
   would fail if the button came back); the separate mid-game
   odds test is byte-unchanged. The suite count staying 105 is
   acceptable ONLY under this reading.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probe on the BUILT dist at phone width (~390×844): the start
   screen contains no Bomb Odds control anywhere; the action row
   holds exactly Start Game and How to Play on ONE row, centered
   (measure both buttons' boxes: same top, pair midpoint ==
   container midpoint). Then start a game: the header Bomb Odds
   button opens the card (figures render), Close dismisses it,
   and the game state (scores, hand size, log length, current
   message) is identical before and after. Compare the start
   screenshot against the owner's complaint: no third button
   wrapped below.
5. **No collateral.** Start Game still starts a match from the
   start screen; How to Play still opens/closes; a full autopilot
   match completes; "chop" appears 0 times in dist player-facing
   strings.
