# 13 — Tien Len

Local web app for Thirteen / Tiến Lên (Nam Rules): you vs three CPU
seats (Mina, Kenji, Rosa), full matches to 13.

The codebase is TypeScript (`src/**/*.ts`, strict mode). TypeScript
is a **dev-only** tool: the shipped site is dependency-free vanilla
JS compiled by `tsc` — no bundler, no runtime dependencies.

## Commands

```sh
npm install   # installs the dev tools (typescript, @types/node)
npm test      # type-checks, compiles to .test-out/, runs the suite
npm run build # type-checks, compiles, and assembles dist/
```

## Build output

`dist/` — static folder, suitable for Cloudflare Pages.

## Layout

- `index.html` — the page
- `src/engine/cards.ts` — deck, rank/suit ordering
- `src/engine/deal.ts` — shuffle and 4 x 13 deal
- `src/engine/combinations.ts` — single / pair / triple / four of a kind / straight detection
- `src/engine/plays.ts` — play comparison (`beats` / `canBeat`): same type, same card count, higher by highest card
- `src/engine/trick.ts` — trick/turn state machine: lead, follow, pass lockout, trick clear, next leader
- `src/engine/bombs.ts` — bomb detection (3-pair / 4-pair double run, four of a kind), bomb-vs-2 comparison, and bomb-on-bomb answers (a beaten bomb pays its beater), incl. comeback-bomb eligibility
- `src/engine/instantWin.ts` — instant-win hand detection at deal: four 2s, six pairs, five consecutive pairs, dragon straight 3–A, three consecutive triples
- `src/engine/scoring.ts` — round scoring: baseline transfers, leftover 2 / unused bomb penalties, instant-win payout
- `src/engine/match.ts` — match state: scores across rounds, first to 13, next-round leader
- `src/engine/ai.ts` — simple deterministic CPU policy: play enumeration + `chooseAction` per turn
- `src/engine/runner.ts` — headless AI-vs-AI full-match runner with a seeded rng
- `src/ui/model.ts` — pure view-model helpers (card labels, selection checks, trick view, log phrasing)
- `src/ui/controller.ts` — DOM-free game controller driving the engine; the page is a thin adapter over it
- `src/main.ts` + `src/styles.css` — the playable page: you vs Mina, Kenji, and Rosa, full match to 13

## Progress

Built task by task through a builder → verifier → merge pipeline:
every PR is independently verified before it merges, and every merge
is deployed to the live site. This table is updated on every PR
completion.

**Play it:** https://13-tien-len.pages.dev/

| Task | What | PR | Status |
| --- | --- | --- | --- |
| 001 | Scaffold + core card engine | #1 | ✅ Merged · Live |
| 002 | Legal play + trick flow | #2 | ✅ Merged · Live |
| 003 | Bombs + instant-win detection | #3 | ✅ Merged · Live |
| 004 | Scoring + round/match flow | #4 | ✅ Merged · Live |
| 005 | CPU AI + seeded runner | #5 | ✅ Merged · Live |
| 006 | Playable UI | #6 | ✅ Merged · Live |
| — | Functional end-to-end tests | #7 | ✅ Merged · Live |
| — | Test consolidation | #8 | ✅ Merged · Live |
| 007 | Play-log polish | #9 | ✅ Merged · Live |
| 008 | Start gate | #10 | ✅ Merged · Live |
| 009 | Balatro restyle (superseded by 010) | #11 | ✅ Merged · Live |
| 010 | True mockup match + Sort/Clear + drag-to-rearrange | #12 | ✅ Merged · Live |
| 011 | Deselect card fix | #13 | ✅ Merged · Live |
| 012 | Bomb penalty (1 pt per bombed 2, instant) | #14 | ✅ Merged · Live |
| 013 | TypeScript migration (strict, zero behavior change) | #15 | ✅ Merged · Live |
| 015 | Fixed-size center pile | #16 | ✅ Merged · Live |
| 016 | Table-talk log: lockouts + itemized penalties | #17 | ✅ Merged · Live |
| 017 | How-to-play cheatsheet overlay | #18 | ✅ Merged · Live |
| 014 | Animations — full bundle (FLIP, deal, collect, bomb juice, instant-win/lockout/penalty) | #19 | ✅ Merged · Live |
| 018 | Cheatsheet bomb examples + playable-bomb flicker (Codex-cloud pilot) | #20 | ✅ Merged · Live |
| 019 | Seamless hand-card hover/select motion | #22 | ✅ Merged · Live |
| 020 | Site favicon — the 2♥ card (original option C) | #23 | ✅ Merged · Live |
| 021 | Bomb on a bomb — answerable bombs + bombed-bomb penalty | #24 | ✅ Merged · Live |
| 022 | Bomb odds reference card — engine-derived dealt-hand odds | #25 | ✅ Merged · Live |
| 027 | Summary modal scrollbars — inner scrollbox, shell never scrolls horizontally | #26 | ✅ Merged · Live |
| 023 | Card hover/select drop — layout-keyed settle, reused hand buttons | #27 | ✅ Merged · Live |
| 028 | LOCKED stamp plays once per lockout, never on clicks | #28 | ✅ Merged · Live |
| 030 | Start-screen Bomb Odds button removed (header copy stays) | #29 | ✅ Merged · Live |
| 031 | Match scores persist in local storage (scores only) | #30 | ✅ Merged · Live |
| 029 | Scoreboard medals — gold for 1st, silver for 2nd (top two only) | #31 | ✅ Merged · Live |
| 024 | Responsive game screen — stage zoom scales with viewport, capped at 1.5x (81px hand card) | #32 | ✅ Merged · Live |
| 025 | Utility buttons warm gold — button.ghost family recolored from the trim (PASS keeps red) | #33 | ✅ Merged · Live |
| 026 | Favicon v2 — card only, full frame, bigger heart (V4) | #34 | ✅ Merged · Live |
| 032 | Round-over banner — labeled PLACE / PLAYER / TOTAL / ROUND columns + medals | #35 | ✅ Merged · Live |
| 033 | Instant-win celebration beat — dedicated INSTANT WIN! beat before the banner, stretched banner timings | #36 | ✅ Merged · Live |
| 034 | Bomb foil goes golden — rainbow sheen replaced with the owner-approved golds-only gradient (V1) | #37 | ✅ Merged · Live |
| 035 | Full codebase + UI/UX audit (report only) — 29 findings, no rule defects; owner walk-through picked the fix batch | — | ✅ Complete |
| 036 | Split src/main.ts into src/dom/ modules; explicit roundId/trickId replace object-identity checks (structure only, zero behavior change) | #38 | ✅ Merged · Live |
| 037 | Phone one-screen layout V3: slim header + ☰ menu, one-row score strip, compact table; A+B fit fix (pile 144px, one-row action row) — reference turn fully in the first screen at 360×640 | #39 | ✅ Merged · Live |
| 038 | No more dead comeback turns — comeback turns offered only when a comeback-legal bomb answer is in hand; dead turns auto-decline (no log line, no pause), zero outcome change | #40 | ✅ Merged · Live |
| 039 | Save only at round end (mid-round reload restarts the round at the last completed standings) + Resume button naming the round and all four scores on the start gate | #41 | ✅ Merged · Live |
| 040 | New Match asks first — confirm dialog (standing line + Keep playing / New Match) freezes the whole page incl. the round-over banner; CPU timers hold and re-arm; start gate and match-over stay one tap | #42 | ✅ Merged · Live |
| 041 | Copy bundle — human-seat grammar, errors read as guidance in an error style, How to Play agrees with the engine + top close/Esc; a11y: Sort labels fixed, both sheets are modal dialogs, log is aria-live | #43 | ✅ Merged · Live |
| 042 | Round-over banner bomb-penalty note rows — per-seat net of mid-round bomb penalties under each player's rows, so previous + ROUND + note = TOTAL reconciles every round | #44 | ✅ Merged · Live |
| 043 | Instant-win match end — the banner title names the winner; the winning hand shows as cards in every instant-win celebration beat (owner option A) | #45 | ✅ Merged · Live |
| 044 | Fast mode + Skip to end of round — Normal/Fast speed setting (650 ms / 250 ms plays, 100 ms passes) and a Skip control once you're out that drains the round to the banner | #46 | ✅ Merged · Live |
| 045 | Visual batch — primaries deepened to AA contrast (blue/red/green ~5.3:1), action buttons ≥44px + CPU counts 12.5px, foil hidden under reduced motion, height-bound stage zoom fits short desktop viewports | #47 | ✅ Merged · Live |
| 046 | One source of truth for rule predicates — bombAnswers/legalBombs/functionedAsBomb/applyTurn single-sourced in the engine; honest leader typing (all five `as number` casts gone, TrickOptions.leader number \| null) — pure refactor, zero behavior change | #48 | ✅ Merged · Live |
| 047 | Tests bundle — bomb-odds enumeration becomes a proven checked-in fixture (default suite 36.4s → 9.3s), coverage gaps closed (two instant-win hands in one deal; a save crossing 13 mid-round pins the round-end rule), Option C probe script checked into tools/probe/, CSS assertions compare parsed values with locked values still pinned — src/ byte-untouched | #49 | ✅ Merged · Live |
| 048 | Build/docs bundle — README serve instructions, in-repo deploy script + test-only PR workflow, self-hosted Nunito (zero external requests), runner.js out of dist + 24 modulepreload links, docs drift fixed through Switch #10 | #50 | ✅ Merged · Live |
| 049 | Restore the mid-round pile-collect animation — the trick winner is captured at trick clear (`lastTrickWinner`) so the pile minis collect to the winner mid-round again; round-end collect untouched, engine zero-diff, regression test fails on main | #51 | ✅ Merged · Live |

## Play

Run `npm run build`, then serve the `dist/` folder — the page is a
module script, so opening the file directly in a browser does not
work. Either `python3 -m http.server -d dist` or `npx serve dist`,
then open the local address it prints. Tap cards to select, then
Play or Pass; Hint highlights the CPU policy's suggestion for your
seat.
- `test/` — the test suites (TypeScript, compiled and run by `npm test`)
