# VERIFY 037 — phone one-screen layout V3 + A+B fit fix (PR #39)

Verifier: independent session (Claude Code run, Switch #9; the
Verifier chat is the fallback). You did not write this code.
Judge the PR against TASK-037 (John's locked V3 pick, the A+B
fit ruling, the letter-spacing .2px approval, and the spacing-
evenness addendum — all recorded in the task file) and the
claims in the PR body; do not fix anything. Post PASS or FAIL
with per-item evidence as a PR comment on PR #39 and write the
verdict to the VERIFY-REPORT.md path named in your prompt.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`8c90225`). `npm test` = 125/125, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly 7 files vs main: `index.html`,
   `src/dom/board.ts`, `src/dom/elements.ts`, `src/dom/menu.ts`
   (new), `src/main.ts`, `src/styles.css`, `test/e2e.test.ts`.
   Engine zero diff. Presentation only: no rule, state, scoring,
   or copy change beyond the strip's compact format; final DOM
   game content identical with the layout on or off.
3. **Test-diff audit.** Exactly 3 new tests (122 → 125). Judge
   the disclosed pin changes explicitly:
   - the ghost-button inventory pin goes 8 → 9 ids with
     `menu-btn` added (first-build disclosure 4) — accept only
     if the `button.ghost` rule count and every colour pin are
     untouched;
   - the ≤520 CSS pin changed across the two commits: the first
     build pinned "no `.pile` sizing in the phone block"; the
     fix — directed by John's A+B ruling — pins pile 144px, the
     B values (12.5px / 6px / 4px), and `letter-spacing:.2px`.
     Accept only if those are the only pin changes and no
     assertion anywhere was removed or weakened; pins
     protecting locked designs (PLAY green / PASS red / ghost
     family / gold YOUR TURN panel / felt) stay intact.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probes on the built dist under the Option C harness rules
   (patched Chrome for Testing 156.0.8078.80 only, probes load
   only locally built dist over localhost/file, every probe
   route-blocks ALL external requests via localOnly, sandbox-OFF
   is the accepted state — never claim sandbox-ON). Scroll to
   (0,0) before overlay/full-page captures.
   - **Reference state** (360×640, seed 1, 8-card hand, single
     2♦ to beat): pile, full hand, AND action-row bottom all
     inside 640. Builder claims: pile 193–337, action row one
     line, bottom **604**. Verify independently.
   - **Worst-case pile** (12-card straight lead): same fit bar;
     builder claims bottom **604**, pile box unmoved.
   - **Round start** (13-card hand): builder claims action
     bottom **695** — the accepted 3-row-hand overflow. Confirm
     the number honestly and that nothing overflows
     horizontally in any state.
   - **Buttons:** all five action buttons ≥44px tall; widths
     claimed 91/44/46/57/53. Judge fix disclosure 3 explicitly:
     PASS is 44 on the rounded measure, 43.58px raw — the same
     basis as the A+B numbers John approved. Accept or fail on
     that basis, stated.
   - **☰ menu (real taps):** opens; How to Play, Bomb Odds, and
     New Match each work from the menu (New Match after a played
     round gives round 1, zeroed scores, fresh deal); item tap
     closes the panel; outside tap and Escape close it; game
     state identical before/after every menu use; menu items
     44px tall.
   - **Score strip:** one row, four single-line cells, full
     names under stress content (13 cards, scores 12/−12/9/−9),
     PASSED pills and 1st/2nd medal tabs visible, turn/fin
     states preserved, no rendered overflow.
   - **"Before that:"** absent at ≤520px, present on desktop.
   - **Spacing evenness:** view the reference-state screenshot
     directly. Claimed shared values: 4px gap rhythm (strip /
     hand cards both axes / action row), even 6px panel padding,
     uniform treatment on all five buttons. Judge fix
     disclosures 2, 4, and 5 (hand panel 6px not 8px; menu
     panel's 17px bottom padding and the 33px ☰ deliberately
     untouched — ☰ stays 33px per John's ruling; strip-cell
     symmetric 6px).
5. **No collateral.** Desktop rendering pixel-identical to main
   at the standard probe states (builder claims 30/30 pairs
   across 5 widths × 6 states); the 521–640 band unchanged;
   Task 027 banner fit, Task 032 banner columns/medals, and the
   Task 033 instant-win beat intact; a full autopilot match
   completes; "chop" appears 0 times in dist player-facing
   strings; zero page errors in probes. Judge first-build
   disclosures 1–13 in the build report (runs/037) against the
   code and your probes — notably #1 (layered ≤520 block on the
   repo's ≤640 breakpoint), #3 (☰ not tappable on the start
   screen — the start overlay covers the header, as on desktop
   today), and #11 (☰ 33px tall per the mockup; John declined
   the raise).

Verdict format: PASS or FAIL, per-item evidence. A FAIL names
the exact failing items.
