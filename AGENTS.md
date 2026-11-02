# AGENTS.md — 13 (Tiến Lên) repo guide

A browser card game: you vs three CPU seats (Mina, Kenji, Rosa), full
matches to 13. Strict TypeScript; the shipped site is dependency-free
vanilla JS compiled by `tsc` — no bundler, no runtime dependencies.

**Play it:** https://13-tien-len.pages.dev/
**Progress board:** the README's Progress table (updated by the foreman
on every PR completion).

## Commands

```sh
npm install   # setup: installs dev tools (typescript, @types/node)
npm test      # type-checks, compiles to .test-out/, runs the suite
npm run build # type-checks, compiles, assembles dist/
```

## How work flows here (the pipeline)

A foreman (Caspian, the owner's agent) scopes every task as a file in
`tasks/`. Two standing chats fill the pipeline's two roles — the
**Thirteen Builder** chat and the **Thirteen Verifier** chat — and
**the two roles are always separate chats**: the chat that built
something never verifies it. The foreman assigns work in those
chats; the owner can watch both work there. (Owner's switches,
2026-11-01: the roles were filled by these same chats for Tasks
001–017, by Codex for Tasks 018–020, by a Muse sub-agent for the
Task 021 build — which Claude Code verified, locally before any
push, at the owner's order — and by Claude Code runs for Task 022.
For Task 027 the Claude Code builder stalled on the owner's
exhausted usage window and a sub-agent fallback finished the build;
the owner then directed a return to the chats — "use the chats, I
want the visibility" — and Task 027's verification ran there.
Switch #5 (owner, 2026-11-02): at Claude's 5-hour reset, Claude
Code resumes — the standing rule is a fresh usage check before
every job: if the job fits the available Claude usage, builder and
verifier run as Claude Code runs (separate runs, pinned
`--model claude-opus-5-5 --effort high`); if it doesn't fit, the
two chats are the fallback. A job already running in a chat when
the window resets finishes in that chat. Task 023's build went to
the Builder chat under this rule (check at assignment: 5-hour
window still at 100%).

- **BUILDER task** — the task file's Status reads `ASSIGNED (builder)`.
  Implement exactly what the task file says, nothing more. Branch
  `task-NNN-<slug>` off `main` in your clone, run the checks, commit
  locally, and end with a report for the foreman: what changed, the
  checks you ran, and any disclosure the task file asks for. The
  foreman pushes the branch and opens the PR against `main`. Never
  merge. Never deploy. Never work on a task whose status is not
  `ASSIGNED (builder)`.
- **VERIFIER task** — the task file's Status reads `ASSIGNED
  (verifier)` and names a PR. Start from a fresh checkout of the PR
  head. Run the task file's checklist plus your own independent probes.
  Return your verdict — PASS or FAIL with evidence (counts, commands,
  what you probed) — to the foreman, who posts it verbatim as a comment
  on the PR. Never fix, never edit code, never merge, never deploy.

The foreman reads the PR and the verdict, merges only on a PASS,
deploys, and updates the README progress table. The foreman also logs
every run's metrics (wall time per role, first-pass verdict, fix
loops, suite delta) in the pipeline metrics ledger.

## Locked rules (do not change — these are the owner's custom rules)

- 4 players, 13 cards each, standard deck. 3 is low, 2 is high; suits
  ♠ < ♣ < ♦ < ♥ (2♥ is the highest card).
- The 3♠ holder leads the first trick of a match, and the 3♠ must be
  in that play. Beat the table with the same kind of set, higher, or
  pass; passing locks you out of the trick; the trick winner leads
  next.
- Bomb ladder: a 3-pair double run bombs a single 2; a 4-pair double
  run bombs a pair of 2s; four of a kind bombs either. Comeback bombs
  (after passing): only four of a kind and the 4-pair double run, on
  your own turn in order. Five consecutive pairs is an instant win
  only, NOT a bomb — triple 2s are unbeatable.
- Bombs can be bombed (owner's ruling, 2026-11-01, Task 021): over a
  bomb, a higher bomb of the same kind answers; a 4-pair double run
  bombs ANY bomb (over another 4-pair run it must be higher); four
  of a kind can never answer a pair-run bomb. Comeback eligibility
  is unchanged and applies to bomb answers too.
- Bomb penalty: when a played 2 is bombed, its owner pays the bomber
  1 point per 2, instantly, mid-round. When a bomb is beaten by
  another bomb, the beaten bomb's owner pays the beater 1 point,
  instantly — a led four of a kind included (Task 021).
- Instant-win hands (dealt): four 2s; six pairs; five consecutive
  pairs; dragon straight 3–A; three consecutive triples. Each other
  player pays the winner 2; the round ends; no leftover penalties.
- Scoring (played to last place): 1st +2, 2nd +1, 3rd pays 1 to 2nd,
  last pays 2 to 1st. Leftover penalties: 1 point per 2 left in hand
  and per unused bomb left, paid to the player directly above (last
  pays 1st). First to 13 points, checked at round end.
- Design principle: power tracks rarity.

The engine (`src/engine/`) and the test suite are the source of truth
for these rules. If a task file ever conflicts with them, stop and
flag it in the PR instead of improvising.

## Conventions

- The suite count must never drop, and no assertion may be weakened.
  Behavior changes require equivalence evidence (seeded runner sweeps)
  as the task file specifies.
- Player-facing vocabulary: the penalty is the "Bomb penalty" — the
  word "Chop" never appears in a player-facing string (internal code
  names are fine).
- Tests are TypeScript, compiled by `tsc` (`npm test` handles it).
  Zero `any` in `src/` and `test/`; strict mode stays on.
- Presentation work (CSS/adapter) must not change game state: final
  DOM/state identical with the feature on or off, and
  `prefers-reduced-motion` disables all animation.
