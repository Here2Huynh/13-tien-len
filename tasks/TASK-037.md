# TASK-037: Phone one-screen layout — V3 "Compact everything"

Status: ASSIGNED (verifier) — PR #39, head 8c90225; checklist
tasks/VERIFY-037.md. **John ruled A+B on 2026-11-04** (see "Fit
ruling" below) and approved letter-spacing .2px; the fix landed
on top of the first build (local commits e8858fc + 709e948) —
measured fit: reference + worst-case action bottom 604, round
start 695 (accepted overflow); suite 125/125 at pickup.
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

## Fit ruling (John, 2026-11-04) — A+B

The first build (e8858fc) hit the STOP case above: with the
207px pile kept, the reference state's action row ends at 721.
John picked **A+B** from the builder's probe-measured options:

- **A:** at ≤520px the pile height is **144px** (Task 015's
  formula without the dropped "Before that:" line; still fixed,
  still worst-case-sized). The locked-scope line "the pile keeps
  the shipped fixed height" is amended to this value at ≤520px;
  the fixed-height PRINCIPLE is unchanged.
- **B:** the action row goes on **one line** at ≤520px (12.5px
  type, 6px side padding, 4px gaps), every button staying
  ≥44×44 (PASS is 44 wide — the floor).
- Expected result (probe-measured): reference AND worst-case
  states fit fully, action-row bottom 607. Round start still
  overflows (3-row 13-card hand) — accepted as reported.
- The CSS pin asserting "no .pile sizing in the phone block"
  updates to pin the 144px value instead.
- The ☰ MENU button stays 33px tall (John was offered the
  spare-room raise to 44px and did not take it).

- **Spacing note (John, 2026-11-04, with the A+B pick):** in the
  ≤520 layout, spacing and padding on all buttons and cards must
  be even and matching — one shared gap/padding rhythm across
  the action row, hand cards (both axes), strip cells, and
  panels; the mockups looked "kind of off" to him. The fit
  numbers (action row ≤640, buttons ≥44×44) still hold.

- **Letter-spacing completion (John, 2026-11-04):** the A+B fix
  as written landed at 655 — the original 607 measurement had
  used a fourth value the report/ruling text omitted. John
  approved adding it: phone action-row buttons get
  `letter-spacing:.2px` (base is .4px), reproducing the approved
  mockup exactly (one row, bottom 607, PASS 44 wide).
