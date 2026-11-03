# TASK 029 — Medals for 1st and 2nd place (scoreboard badges)

Status: ASSIGNED (verifier) — built by the Builder chat (local commit 4b1eebb; pushed head f7af247), PR #31: https://github.com/Here2Huynh/13-tien-len/pull/31. Verify against `tasks/VERIFY-029.md`. Owner pick locked 2026-11-01: top two only. Route: Switch #6 chats.
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, with screenshot: the scoreboard's green finish
pills ("1ST", "2ND") should be medals — **gold for 1st, silver for
2nd**. His pick on scope: **top two only** — 3rd and 4th keep
today's green pills exactly as they are.

## Where it lives (foreman-traced; verify it)

`renderScoreboard` in `src/main.ts`: a player who has finished the
round gets `<span class="badge done">` with their ordinal from
`ORDINALS` (`1st`…`4th`), styled by `.badge.done` in
`src/styles.css`. The "Passed" badge (`.badge.pass`) and the
"Finished 1st" meta line under each score are separate — both stay
untouched.

## The change

- Finish place 1 → a **gold medal**; finish place 2 → a **silver
  medal**, in the pill's place next to the player's name.
- Form: drawn in the game's flat style — a small medal disc with
  the place number (1 / 2) stamped in it and a short ribbon —
  inline SVG or pure CSS, builder's craft. NO emoji (platform
  rendering varies; the game's art is drawn). Sized to the pill's
  footprint so the scoreboard layout does not shift.
- The medal keeps an accessible name for the place (the meta line
  "Finished 1st" also remains visible text, unchanged).
- 3rd and 4th: the existing green `.badge.done` pill, unchanged.
  "Passed" badge unchanged. Nothing else on the scoreboard
  changes — no layout, color, or motion changes elsewhere.

## Acceptance shape

- Tests pin the new markup/CSS per the earlier style-task pattern
  (1st renders the gold medal, 2nd the silver, 3rd/4th still the
  pill); suite green at whatever count it stands when assigned.
- Before/after screenshots at phone size in the PR showing a
  finished round's scoreboard; `npm run build` clean.
- Presentation layer only (`src/main.ts` / `src/styles.css`);
  engine untouched.
