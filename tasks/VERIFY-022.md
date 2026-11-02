# VERIFY 022 — Bomb odds reference card

Status: ASSIGNED (verifier) — PR #25
Read `AGENTS.md` first; it governs how work flows in this repo.

Independent verification of PR #25 (builder: Claude Code; local
commit `6f3e005`). Start from a fresh checkout of the PR head. You
verify; you never fix code. Verdict PASS/FAIL with per-item
evidence, returned to the foreman, who posts it verbatim on the PR.

## Checklist

1. **Independent run.** `npm install`, `npm test`, `npm run build`.
   Expect 101/101 (baseline 96 on `main`). Test diff: additions
   only, no weakened or removed assertion.
2. **Scope.** Diff vs `main` names exactly 6 files (`index.html`,
   `src/main.ts`, `src/styles.css`, `test/e2e.test.ts`, new
   `test/bomb-odds.ts`, new `test/bomb-odds.test.ts`). `src/engine/`
   untouched.
3. **The figures — re-derive them yourself.** With your own
   enumeration (any correct method), confirm or refute all ten
   exact hand counts the builder shipped, and confirm every figure
   string on the card equals the engine-formatted value. Adjudicate
   the six-pairs question from the engine's source: does
   `detectInstantWin` count pairs as `floor(n/2)` (a four of a kind
   = two pairs)? Is the award priority four 2s → dragon → triples →
   five pairs → six pairs? Do the five rows sum exactly to Any
   instant win? Is the card's note line ("counts once, as the one
   the game awards") accurate?
4. **Card behavior.** Ships hidden; a "Bomb odds" button sits next
   to How to Play in both places; the card is NOT inside the help
   overlay; open/close leaves the page and game state identical —
   probe this independently, including mid-game with CPU timers
   pending (queued turns still run normally afterward). The card
   has no animation or transition of its own.
5. **Strings.** Every builder-claimed string present verbatim
   (buttons, title, framing line, group headers, row labels, note,
   Close). No "chop" in any player-facing string.
6. **Layout evidence.** Document, with measurements: card fit at
   360×640 and 320×568, and the header at 360 px wide (the builder
   disclosed that New match wraps to its own line — confirm or
   refute; this is evidence for the owner, not an automatic fail).
7. **The enumeration is real.** Read `test/bomb-odds.ts`: it must
   derive counts from the engine's own detectors, not restate
   hardcoded totals. Spot-check by perturbing one shipped figure
   in a scratch copy — the card-figure test must fail.

FAIL = name the exact item and the evidence. No style notes, no
fixes, no code edits.
