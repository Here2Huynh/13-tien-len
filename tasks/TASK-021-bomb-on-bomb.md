# TASK 021 — Bomb on a bomb: answerable bombs + bombed-bomb penalty

Status: COMPLETE (PR #24 — verifier PASS, Claude Code, 2026-11-01)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner ruling (John, 2026-11-01 — this closes the parked bomb-vs-bomb
question; do not redesign it):

## Legal answers to a bomb on the table

The existing ladder against 2s is unchanged (3-pair run bombs a single
2; 4-pair run and four of a kind bomb a single 2 or a pair of 2s;
nothing bombs triple 2s; five consecutive pairs is instant-win only).
New: a bomb that is the play to beat can itself be answered:

- **Higher same kind:** a higher 3-pair double run over a 3-pair run;
  a higher 4-pair double run over a 4-pair run; a higher four of a
  kind over a four of a kind. (Four-of-a-kind over four-of-a-kind
  already works via the same-type rule — the rest is new: today a
  pair-sequence bomb is unanswerable.)
- **The 4-pair double run bombs any bomb:** any 4-pair run beats a
  3-pair run bomb or a four of a kind (led or bombing) regardless of
  rank. Over another 4-pair run it must be higher.
- **Four of a kind canNOT answer a pair-run bomb** (3-pair or 4-pair).
  A 3-pair run answers nothing except a lower 3-pair run.

## Comebacks — unchanged eligibility

A player who has passed in the trick may answer only with a four of a
kind or a 4-pair double run, on their own turn in order, against a
play made after their pass — exactly today's eligibility, now applied
to bomb-on-bomb answers too. So a higher 3-pair run is never a
comeback answer; a 4-pair run is (including over a bomb); a four of a
kind comeback works over a four-of-a-kind bomb but not over a
pair-run bomb (kind rules still bind).

## Bombed-bomb penalty (extends the Task 012 bomb penalty)

Whenever a bomb play is beaten by another bomb play, the beaten
bomb's owner pays the player who beat it **1 point, instantly,
mid-round**. This includes a **led** four of a kind beaten by a higher
four of a kind or by a 4-pair run (owner's words: "bombs get bombed
needs penalty"). Chains cascade: every bombed bomb costs its owner
1 point at the moment it is beaten, and payments already made stand.
The bombed-2 penalty is unchanged and separate (paid when the first
bomb lands; a bombed pair of 2s = 2 points). Player-facing name stays
"Bomb penalty"; the word "Chop" appears in no log/UI string. Log lines
follow the established style (per-seat possessives) and must name the
payer, the payee, the amount, and that a bomb was bombed — propose the
exact strings in the PR for verifier checking. A bomb that was played
and bombed can never also be charged as an unused-bomb leftover.

## Consistency requirements

- Legal-play generation, the CPU policy's legal set, Hint, and the
  Task 018 playable-bomb flicker must all follow the new ladder
  (flicker keys off true playability — a bomb that can answer the
  bomb on the table flickers; one that cannot, e.g. a four of a kind
  facing a pair-run bomb, does not). No CPU policy redesign: same
  heuristics over the enlarged legal set.
- The Task 014 penalty float/flash treats a bombed-bomb penalty like
  a bombed-2 penalty (reuse; no new animation design).
- Presentation/state separation and `prefers-reduced-motion` rules
  from `AGENTS.md` still hold.

## How to play (cheatsheet)

The BOMBS and BOMB PENALTY content gains, in player language:
bombs can be bombed; a higher bomb of the same kind answers; a
4-pair double run bombs any bomb; a four of a kind can't bomb a
pair-run bomb; when your bomb is bombed you pay 1 point instantly to
the player who bombed it. Include one concrete worked example in the
style of the Task 018 bomb examples (a 2 bombed by a 3-pair run, then
that bomb bombed by a higher 3-pair run, with the two 1-point
penalties spelled out). Every fact stated must be true under the
engine as you ship it.

## Tests

Suite is 79 at `main`; it must not drop and no assertion may weaken.

- Engine coverage of the full answer matrix: every bomb kind against
  every bomb target kind, rank comparisons included, plus the
  4-pair-run-beats-any-rank rule and the four-of-a-kind exclusions.
- Comeback eligibility cases (3-pair answer after passing rejected;
  4-pair answer after passing accepted; four of a kind over a
  pair-run bomb after passing rejected).
- Penalty cases: single bomb-on-bomb; a two-link chain (2 bombed,
  then that bomb bombed — both payments, correct payer/payee each);
  a led four of a kind beaten by a higher four of a kind and by a
  4-pair run; pair of 2s bombed and that bomb bombed (2 pts + 1 pt);
  a scripted full round proving a played-and-bombed bomb is not also
  charged as an unused-bomb leftover.
- Seeded-runner evidence that play outside the new paths is unchanged:
  sweeps on main vs your branch must produce identical outcomes
  except where a bomb-on-bomb play actually occurs; disclose and
  attribute every divergence.

Branch `task-021-bomb-on-bomb` off `main`; commit locally and report
per `AGENTS.md` (the foreman pushes and opens the PR).
