# TASK 022 — Bomb odds reference card

Status: QUEUED (behind Task 021 — becomes ASSIGNED (builder) only
after Task 021 merges; branch off the post-021 `main`)
Read `AGENTS.md` first; it governs how work flows in this repo.

FR (John, 2026-11-01): show the probability of each bomb on a
reference card in the game. Placement is the owner's pick: a
**standalone reference card with its own button next to How to Play**
(not a section inside the How to Play overlay).

## The card

- Its own overlay, styled like a game card, opened by a "Bomb odds"
  button in both places How to Play appears (start screen + header).
  Open/close never touches game state — same guarantee as the
  Task 017 help overlay, including mid-game with CPU timers pending
  (the verifier will probe exactly that).
- Content: the chance that a dealt 13-card hand contains each
  pattern, as a percentage and a "1 in N" figure, in two groups —
  BOMBS and INSTANT WINS — plus the framing line that these are
  dealt-hand odds. Player vocabulary only; the word "Chop" appears
  nowhere.
- Fits one phone screen without scrolling at the game's existing
  overlay sizes; no new animation (if any is added:
  transform/opacity only, off under `prefers-reduced-motion`).

## The numbers (verify before you ship them)

Foreman's exact enumeration over all C(52,13) dealt hands:

| Pattern | % | 1 in |
| --- | --- | --- |
| 3-pair double run | 8.36 | 12 |
| Four of a kind | 3.42 | 29 |
| 4-pair double run | 0.96 | 104 |
| Any bomb | 11.63 | 8.6 |
| Six pairs | 0.40 | 248 |
| Four 2s | 0.26 | 379 |
| Five consecutive pairs | 0.065 | 1,542 |
| Dragon straight | 0.058 | 1,720 |
| Three consecutive triples | 0.010 | 10,041 |
| Any instant win | 0.79 | 127 |

These were computed with the foreman's own pattern definitions.
**Your job: re-derive every figure with an enumeration driven by
the engine's own detectors** (`detectBomb` and the instant-win
detection the engine actually uses) and ship the engine-derived
numbers. If any figure differs from the table above, ship the
engine's and flag the difference prominently in the PR. The card's
numbers are facts players will rely on — matching the engine beats
matching this table.

## Tests

Suite is 79 at `main` (will be higher after Task 021); it must not
drop and no assertion may weaken.

- The card ships hidden; both buttons exist; open/close leaves game
  state byte-identical (mirror the Task 017 overlay tests).
- Every figure shown on the card is asserted present in the shipped
  page, and a test or checked-in script reproduces the enumeration
  result for at least the three bomb kinds (so the numbers stay
  honest if the engine's detection ever changes).

Branch `task-022-odds-reference-card` off `main`; commit locally and
report per `AGENTS.md` (the foreman pushes and opens the PR).
