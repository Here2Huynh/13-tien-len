# TASK 031 — Persist match scores in local storage

Status: ASSIGNED (builder) — Task 030 closed 2026-11-02; owner
FR + pick locked 2026-11-02: SCORES ONLY, in local storage —
survives refresh and tab close. Route: the Thirteen Builder
chat (Switch #6).
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's request, in his words: "Add game scoring caching into
the browser" — today a refresh or a closed tab zeroes the whole
match, even at 11–4 in round 9. Scope is deliberately narrow:
the match POINTS persist; the hand in progress does not.

## What persists

- The four seats' match points and the current round number.
  Nothing else: no hands, no trick state, no turn state, no log.
- Storage: `localStorage`, one versioned key
  (`thirteen.matchScore.v1`), JSON. The version suffix is the
  invalidation path for future changes — a save whose version or
  shape doesn't match is discarded, never migrated, never
  crashed on.

## Behavior

- SAVE: whenever the scoreboard values change during an
  in-progress match (points or round), write the save. A 0–0
  round-1 board writes nothing (no pointless saves).
- RESTORE: on page load, a valid save seeds the match behind the
  start gate — pressing Start Game deals the saved round number
  with the saved points on the board. The start screen itself is
  unchanged (same title, same buttons, no new UI).
- CLEAR: the save is removed when a match ends (someone reaches
  13) and when New Match starts a fresh match. After either, a
  reload starts at 0–0 as today.
- VALIDATE on read: points are integers 0–12 for every seat
  (a finished match never restores), round is an integer ≥ 1,
  exactly four seats. Anything else — corrupt JSON, wrong shape,
  out-of-range values — discard the save and start fresh.
- UNAVAILABLE storage (private mode, quota, throws on access):
  the game plays exactly as today. All storage access is
  failure-tolerant; a storage exception must never break a render
  or a click.

## Layering

- Persistence lives in the adapter/storage layer, not the engine:
  scoring rules, points math, and round flow are untouched. The
  controller may gain a way to seed a new match with starting
  points + round; if you find the seed genuinely needs an engine
  change, stop and flag it to the foreman first.

## Tests

- Save written on a points change and on a round advance; not
  written at 0–0 round 1.
- Reload restores points and round exactly; play continues and
  scoring accumulates on top of the restored values.
- Match end clears; New Match clears; corrupt/wrong-shape/
  out-of-range saves are discarded with a fresh 0–0 start.
- Storage that throws on every access: a full match still plays
  and completes.
- Suite grows from 105, no weakened assertions.

## Proof in the PR

- Real-app probe (Playwright, persistent browser context): play
  to a nonzero score mid-match, reload the page — points and
  round intact; open a NEW page in the same context (the tab
  close case) — still intact; click New Match, reload — 0–0.
- `npm run build` clean; engine diff zero (or the flagged
  exception, foreman-approved); "chop" still 0 in dist strings.
