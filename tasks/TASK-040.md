# TASK-040: Confirm before New Match wipes a match (audit #9)

Status: ASSIGNED (builder) — TASK-039 closed 2026-11-04. Suite baseline: 142.
Source: Task 035 audit finding #9 — **John's pick in the
2026-11-04 walk-through: "Build."**

## The defect (audit #9)

The header New Match button is one tap with no confirmation: a
mis-tap mid-match wipes the whole match (scores, round, save).
On the phone it is also a 33px target (the header/☰ size John
accepted for 037 — not part of this task).

## Locked scope

1. **Confirm before wiping an in-progress match.** Activating
   New Match while a match is in progress asks for confirmation
   first (the game's own dialog idiom — the start overlay /
   banner modal family, not a browser `confirm()` unless the
   builder shows the native dialog breaks the app's patterns;
   if an in-app confirm is used it follows the overlay
   conventions: dialog semantics, Esc cancels).
2. **Cancelling keeps everything:** scores, round, current hand,
   and the stored save are untouched; the game resumes exactly
   where it was (including a paused CPU sequence, if any).
3. **Confirming starts fresh:** the save is cleared and a new
   match begins at 0-0, round 1 — identical to today's New Match
   behavior.
4. **No friction where there is nothing to lose:** on the start
   screen (no match in progress) and on the match-over banner,
   New Match stays one tap, no confirmation.
5. The rule applies to **every** New Match entry point: the
   header button, the phone ☰ menu item (Task 037), and any
   other path that starts a new match mid-play. (The start-gate
   "New Match" beside Resume — Task 039 — starts from the idle
   gate where no match is in progress: one tap, unchanged.)

## Hard boundaries

- No game-rule, scoring, or save-format change. Task 039's
  save-clearing behavior on a CONFIRMED New Match is unchanged.
- Presentation/flow only: a seeded match that never touches New
  Match plays identically (plays, log, scores) before/after.
- Suite floor 142; zero `any`; strict on.

## Proof bar

- Full suite + build green, including NEW tests: confirm shown
  only when a match is in progress; cancel preserves state and
  save bytes exactly; confirm clears the save and deals a fresh
  match; start-screen and match-over paths stay one-tap.
- Option C probe: mid-match, tap New Match (desktop header AND
  phone menu) → confirmation appears, game state frozen behind
  it; cancel → play resumes unchanged; confirm → fresh 0-0
  round 1 with the save cleared. One full autopilot match
  completes with 0 page errors.
