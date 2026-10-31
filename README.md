# 13 — Tien Len

Local web app for Thirteen / Tiến Lên (Nam Rules).

Current state: initial scaffold + core card engine only.
No game UI, no AI, no scoring, no bombs, no instant-win logic yet — those are later tasks.

## Commands

```sh
npm install   # no dependencies yet; still safe to run
npm test      # unit tests (node --test)
npm run build # static build
```

## Build output

`dist/` — static folder, suitable for Cloudflare Pages.

## Layout

- `index.html` — minimal placeholder page
- `src/main.js` — placeholder page script
- `src/engine/cards.js` — deck, rank/suit ordering
- `src/engine/deal.js` — shuffle and 4 x 13 deal
- `src/engine/combinations.js` — single / pair / triple / four of a kind / straight detection
- `src/engine/plays.js` — play comparison (`beats` / `canBeat`): same type, same card count, higher by highest card
- `src/engine/trick.js` — trick/turn state machine: lead, follow, pass lockout, trick clear, next leader
- `src/engine/bombs.js` — bomb detection (3-pair / 4-pair double run, four of a kind) and bomb-vs-2 comparison, incl. comeback-bomb eligibility
- `src/engine/instantWin.js` — instant-win hand detection at deal: four 2s, six pairs, five consecutive pairs, dragon straight 3–A, three consecutive triples
- `src/engine/scoring.js` — round scoring: baseline transfers, leftover 2 / unused bomb penalties, instant-win payout
- `src/engine/match.js` — match state: scores across rounds, first to 13, next-round leader
- `src/engine/ai.js` — simple deterministic CPU policy: play enumeration + `chooseAction` per turn
- `src/engine/runner.js` — headless AI-vs-AI full-match runner with a seeded rng
- `src/ui/model.js` — pure view-model helpers (card labels, selection checks, trick view, log phrasing)
- `src/ui/controller.js` — DOM-free game controller driving the engine; the page is a thin adapter over it
- `src/main.js` + `src/styles.css` — the playable page: you vs Mina, Kenji, and Rosa, full match to 13

## Play

Run `npm run build` and open `dist/index.html` in a browser (or serve
the `dist/` folder). Tap cards to select, then Play or Pass; Hint
highlights the CPU policy's suggestion for your seat.
- `test/` — unit tests
