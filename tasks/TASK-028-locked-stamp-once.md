# TASK 028 — LOCKED stamp: play it once, when the lock lands

Status: ASSIGNED (builder) — Task 023 closed 2026-11-02; owner
pick locked 2026-11-01: stamp once at the lock, never on the
owner's clicks. Route: the Thirteen Builder chat (Switch #6 —
builder and verifier stay in the chats)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report: every time he clicks anything — a card in his hand,
any button — the LOCKED stamp on the other players animates again.
The stamp should mark the moment a player gets locked out of a
trick, not echo the owner's clicks.

## Diagnosis (foreman-traced; verify it)

`.seat.lockedout .opp::after` carries `animation: stampIn .28s …
both` — the stamp is a pseudo-element whose animation starts when
the element is (re)created with the class. `render()` rebuilds the
seat DOM on state changes, so each rebuild of a locked seat
re-creates the stamp and replays `stampIn`. Same rebuild habit
behind Task 023's dip, different symptom.

## The fix (owner's pick)

- The stamp animation plays **exactly once per lockout**: at the
  render where a player newly becomes locked out in the current
  trick, their stamp animates in. Any later re-render while they
  remain locked — owner's selection clicks, Hint, Sort, Clear,
  other players' actions that don't change the lock set — shows
  the stamp already settled, no replay.
- A NEW lockout (next trick, or a player locking later in the same
  trick) stamps again, once, for that player.
- The stamp's look is unchanged: same badge, same `stampIn`
  keyframes, duration, and easing when it does play. The locked
  seat's greyed card backs are unchanged.
- The separate pass flash (the fx-driven shake/flash for newly
  locked seats) already fires once per lock — do not break,
  duplicate, or merge it with this fix.
- `prefers-reduced-motion` behavior unchanged (the stamp is
  already animation-free there).
- The owner's own lockout presentation (greyed hand) is out of
  scope.

## Proof bar (real app, not fakes — the Task 019/023 lesson)

- Real-browser probes on the built `dist/`: drive a game until an
  opponent locks out; confirm the stamp animates once; then click
  cards, Hint, Sort, and Clear and confirm the stamp does not
  animate again (e.g. via the Web Animations API / animation
  start times, not eyeballing).
- Confirm a subsequent trick's new lockout stamps again.
- Suite green at whatever count it stands when assigned, with new
  tests pinning the behavior/CSS per the earlier style-task
  pattern; `npm run build` clean.
- Engine untouched. Presentation layer only (`src/main.ts` /
  `src/styles.css`).
