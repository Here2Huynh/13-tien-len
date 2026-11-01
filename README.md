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
- `src/engine/bombs.ts` — bomb detection (3-pair / 4-pair double run, four of a kind) and bomb-vs-2 comparison, incl. comeback-bomb eligibility
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
| 014 | Animations — full bundle (FLIP, deal, collect, bomb juice) | — | ⏳ Queued |

## Play

Run `npm run build` and open `dist/index.html` in a browser (or serve
the `dist/` folder). Tap cards to select, then Play or Pass; Hint
highlights the CPU policy's suggestion for your seat.
- `test/` — the test suites (TypeScript, compiled and run by `npm test`)
