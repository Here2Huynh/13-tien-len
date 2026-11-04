# TASK-037: Phone one-screen layout — V3 "Compact everything"

Status: QUEUED (builds after TASK-036 merges — this layout work
sits on the split src/dom/ structure). Suite baseline: 122.
Source: Task 035 audit finding #2. Mockups produced 2026-11-04
(~/workspace/13tl-mockups-phone/, measured at 360×640 on the real
game); **John picked V3 on 2026-11-04 and picked the closer trade:
drop the "Before that:" line.**

## The problem (audit #2, reproduced by the mockup baseline)

At 360×640 the first screen is entirely header + 2×2 scoreboard.
The play to beat sits at y≈665–872, the hand at y≈1013–1171, the
Play button's bottom at y≈1258 — **618px below the fold**. No
scroll position shows the play to beat and the Play button
together.

## Locked design — V3 at the phone breakpoint

Applies at the existing phone breakpoint (≤520px). **Desktop
layout is unchanged** (the desktop height fix is audit #3, a
different task). All changes are presentation; game state and the
final DOM's game content are identical with the layout on or off.

1. **Slim header, one row:** the "13" mark + "Round N" + a single
   **☰ MENU** button. How to Play, Bomb Odds, and New Match move
   into that menu — as working actions wired to the same handlers,
   not decoration. (TASK-039's New Match confirm, when it lands,
   applies to the menu item too.)
2. **Score strip replaces the 2×2 scoreboard:** one horizontal
   strip, four single-line cells — name, score, cards left
   ("YOU 0 · 8"). The strip preserves what the scoreboard
   communicated: PASSED badges and the leader/turn highlighting.
3. **Compact table:** slimmer CPU seat boxes; the pile keeps the
   shipped fixed height (the worst-case 12-card lead must not
   push the layout around); tighter paddings throughout.
4. **The "Before that:" line is not rendered at this breakpoint**
   (John's closer trade, picked over shrinking the pile minis or
   the top card-backs). Desktop keeps the line.
5. **Hand panel tightened;** phone hand cards may go to the
   mockup's ~42px. The action row meets audit #12's minimums
   (≥44px tall targets) within the fit — no shrinking buttons to
   make the numbers work.
6. Start screen and round-over banner must render sanely at this
   breakpoint under the slim header/strip (the mockup start
   screens are the reference).

## Fit bar (measured, Option C probe, 360×640)

- **Reference state** (seed-1 mid-game human turn, 8-card hand,
  single-card play to beat, as in the mockups): pile, full hand,
  AND the action row's bottom all inside the first 640px
  viewport. The mockup reached 677px with the Before-that line
  present; dropping it (~40px) plus the real build's exact
  spacing must close the gap. If the shipped fixed pile height
  makes 640 unreachable, stop and report the exact shortfall —
  do not quietly shrink something else.
- **Round-start state** (13-card hand): measure and report the
  action row's position honestly; overflow there is reported,
  not hidden.
- **Worst-case pile** (12-card straight lead): measure and
  report likewise.

## Hard boundaries

- Presentation only — no rule, state, copy (beyond the strip's
  compact format), or scoring changes. Locked designs stay:
  PLAY green / PASS red / ghost family, gold YOUR TURN hand
  panel, the felt table.
- The desktop rendering must stay pixel-identical to current
  main at the standard probe states.
- Suite count never drops below 122; zero `any`; strict on.
  CSS-pin tests may be updated for the new phone rules with
  numbered disclosures; pins protecting locked designs stay.

## Proof bar

- Full suite + build green.
- Option C probe at 360×640: baseline-vs-new measurements table
  (document height; pile, hand, action-row y-ranges) for the
  reference state, round start, and a worst-case-pile state;
  screenshots of the reference turn, the start screen with the
  menu closed AND open (menu items visible), and the round-over
  banner.
- Desktop probe states pixel-identical to main.
- The ☰ menu's three actions demonstrably work in the probe
  (open How to Play, open Bomb Odds, and New Match starts a
  fresh match).
