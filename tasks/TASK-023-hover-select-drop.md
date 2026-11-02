# TASK 023 — Fix the card hover/select drop

Status: PLANNING (owner feedback 2026-11-01 — a Claude Code
recommendation comes first; this becomes ASSIGNED (builder) only
after the owner picks an approach)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, in his words: he doesn't love the card animation on
hover and on select — "it makes an unnecessary drop down after
selecting." The hand-card motion shipped by Task 019 (seamless
hover/select transitions) reads as: lift on hover, lift on select,
then an extra downward dip before the card settles. That dip is the
defect. The fix removes it; the motion should go directly to the
selected pose and stay there.

## Process for this task (owner's order)

1. A Claude Code consultation run diagnoses the cause in the
   current code and recommends a fix (with alternatives and
   trade-offs) — no code changes in that run.
2. The foreman brings the recommendation to the owner; the owner's
   pick is recorded here before any build starts.
3. Only then: builder implements the picked approach, verifier
   checks it independently, standard pipeline.

## Non-regression constraints (from Tasks 011 / 019)

- The selected pose still outranks the hover pose (Task 019's core
  rule); one shared transition drives the hand-card motion.
- The Task 011 guard stands: hover lift applies only under
  `@media (hover:hover) and (pointer:fine)` — no sticky touch hover
  on phones.
- `prefers-reduced-motion` still disables the motion.
- No other animation changes: deal, bomb juice, pass/lockout,
  penalty float, and the Task 018 flicker are out of scope.
- CSS/presentation only unless the consultation proves the cause
  lives in JS-driven transforms — if so, the recommendation must
  say exactly why.

## Acceptance shape (finalized after the owner's pick)

- The builder's evidence includes computed-transform traces over
  the hover→select→deselect paths showing a monotonic move to the
  selected pose with no downward reversal (the Task 019 probe
  pattern), plus the full suite green (≥96, no weakened
  assertions).
- The owner's real-phone feel check remains the final word, as
  with Tasks 011/019.
