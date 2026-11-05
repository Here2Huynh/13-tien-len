# TASK-038: No more dead comeback turns (audit #1)

Status: COMPLETE — PR #40, merged 6924ea3, deployment
e64aa576-0efd-4a1f-b1a1-399475574094. Suite 125 → 134.
Verifier PASS (Verifier chat, Switch #9 fallback after the
Claude Code verifier died on the 5h usage limit): all items
PASS on head e55edde — own equivalence seeds 1–101 (6,839
auto-declines matched 1:1 to old forced passes, live offers
38 → 38), own 1,000-match sweep (dead 68,465 → 0, live 433
unchanged, deadOnTriple2s 0 — disclosure 3 CONFIRMED),
false-negative hunt 1,482 states 0 mismatches, Option C
probes (seeds 23/39 dead stops gone, seed 38 live comeback
stops with the four 4s). Disclosures 1–3 accepted/confirmed.
Source: Task 035 audit finding #1 — John's first pick of the
walk-through (2026-11-04, "Build it").

## The defect (audit #1, verified against the engine)

When a player has passed and the trick continues without them,
certain later plays against their earlier pass offer a "comeback
turn" — the one opening to answer with a comeback-eligible bomb
(four of a kind or the 4-pair double run, per the locked rules).
The engine's `hasComebackTurn` check never looks at the player's
hand: it opens the turn on shape alone. Measured over the audit's
3,000-match sweep: **205,651 dead turns vs 1,378 live ones —
99.3% of comeback turns have exactly one legal action, Pass.**
Two shapes dominate:
- **Triple 2s on the table** (~54% of dead turns): nothing can
  bomb triple 2s, so every offered turn is dead by rule.
- **Locked hands generally** (~46%): the player's hand holds no
  comeback-legal bomb that beats the table play.

Player cost: ~17 forced Pass taps + ~33s of CPU dead air per
match for the human; the screen also tells a locked-out player
"YOUR TURN," which mis-describes the state (the audit's second
half of this finding).

## Locked scope

1. **A comeback turn is offered only when it is live:** the
   player holds at least one comeback-legal play — a
   comeback-eligible bomb (four of a kind / 4-pair double run,
   per the locked comeback rules) that legally answers the
   current table play under the locked bomb-vs-bomb rules.
2. **Triple 2s never open a comeback turn** (nothing can answer
   them; covered by rule 1, called out because it's the dominant
   case).
3. **When no live comeback exists, the turn is declined
   automatically** — the game proceeds exactly as if the player
   passed at that point: same subsequent order, same plays,
   same scores. Zero outcome change.
4. **The turn prompt tells the truth:** a player who is locked
   out is never shown "YOUR TURN" for a state where Pass is the
   only legal action. Live comeback turns still prompt normally.

## Hard boundaries

- **Zero outcome change** is the whole task: seeded autopilot
  matches (plays, log lines, final scores) identical before/
  after across a broad seed set — the ONLY permitted differences
  are (a) the absence of the auto-declined turns' pass actions/
  prompts and their log lines, and (b) honest prompt copy under
  rule 4. The equivalence harness must account for exactly those
  and nothing else.
- Locked comeback RULES do not change: eligibility (four of a
  kind / 4-pair run only), the own-turn-in-order requirement,
  bomb-vs-bomb answering — all as ruled. This task changes when
  the turn is *offered*, never what is *legal* in it.
- A genuinely live comeback turn must still be offered in every
  case — a false negative (a real comeback silently skipped) is
  a FAIL-grade defect. The seeded evidence must include live
  comeback cases (the audit's seeds 38/56/101 family and the
  sweep's live-turn population) proving they still trigger.
- Suite floor 125; zero `any`; strict on.

## Proof bar

- Full suite + build green, including NEW tests: dead comeback
  auto-declined (incl. the triple-2s case), live comeback still
  offered (four of a kind and 4-pair run cases), prompt honesty
  for locked-out states.
- Seeded equivalence as scoped above, at least 20 seeds at
  controller level, with the diff accounting shown (auto-declined
  turns enumerated and matched to the old build's forced passes).
- A sweep (audit method, ≥1,000 matches) reporting the dead-turn
  count before/after: after = 0 offered-dead turns, and live
  turns offered unchanged in count.
- Option C probe: a seeded replay that previously produced a
  dead human comeback turn now flows past it without a "YOUR
  TURN" stop; a live comeback replay (seed 38) still stops and
  offers the bomb.
