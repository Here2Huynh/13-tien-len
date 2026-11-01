# VERIFY 019 — Hand cards: one seamless hover/select motion (desktop)

Status: ASSIGNED (verifier)
Read `AGENTS.md` first; it governs how work flows in this repo.
You are the VERIFIER. The builder session was a different session; you
never fix, edit, merge, or deploy. Your verdict goes back to the
foreman, who posts it on the PR and merges only on a PASS.

**PR:** #22 — https://github.com/Here2Huynh/13-tien-len/pull/22
**Head:** `85636cb` on branch `task-019-seamless-card-motion`
**Task file:** `tasks/TASK-019-seamless-card-motion.md`

## Checklist

1. Start from your own fresh checkout of the PR head `85636cb`.
   Confirm the diff against `main` is exactly `src/styles.css` +
   `test/e2e.test.ts` — nothing else.
2. `npm install`, `npm test`, `npm run build`. Expect the suite at
   77/77 (76 baseline + 1 new) with no failures, and a clean build.
   Read the test diff: exactly one added test; no existing assertion
   removed or weakened.
3. Cascade audit, independently: parse the shipped stylesheet and
   confirm the winning declarations per hand-card state —
   - exactly one `:hover` rule applies to hand cards, inside
     `@media (hover:hover) and (pointer:fine)` (TASK 011 guard);
   - the selected pose (`translateY(-15px)`, blue ring, `#e8f5ff`)
     beats hover for a selected card (equal specificity, source
     order), with pose values unchanged from `main`;
   - one shared transition spec on the base hand-card rule
     (transform + box-shadow together), and `.dragging` still has
     `transition:none`;
   - no `:active` rule targets hand cards; `filter:none` on the base
     rule blocks the generic `button:hover` brightness leak;
   - bomb flicker/glow and `.bombhot.sel` rules are untouched;
   - after build, `dist`'s stylesheet is byte-identical to
     `src/styles.css`.
4. Pointer probe: a probe script is provided OUTSIDE the checkout at
   `~/workspace/13tl-verify-019-probe.cjs` (usage:
   `node ~/workspace/13tl-verify-019-probe.cjs <path-to-styles.css>`).
   Attempt to run it against your checkout's stylesheet. Note: in the
   builder's sandbox Chromium crashed at launch
   (`setsockopt: Operation not permitted`) — if your environment
   blocks it the same way, say so plainly, do not fabricate results,
   and instead audit the script and the foreman's recorded results in
   the PR body (legs covered, sampling method, what was asserted).
5. Presentation-only: no engine, controller, model, or log changes;
   no player-facing string changes; the word "Chop" appears nowhere
   new.

## Verdict

End your session with a clear PASS or FAIL as the final line, backed
by the evidence above (counts, commands, what you probed, and whether
the probe ran in your environment or was audited).
