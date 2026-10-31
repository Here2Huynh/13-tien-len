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
- `test/` — unit tests
