# VERIFY 024 — responsive stage scaling, capped at 1.5x (PR #32)

Verifier: independent session (the Verifier chat, Switch #6). You
did not write this code. Judge the PR against TASK-024 (owner's
CAP pick: stage scales proportionally, stops at 1.5x the current
desktop presentation, hand cards max 81px, centered past the cap)
and the claims in the PR body; do not fix anything. Post PASS or
FAIL with per-item evidence as a PR comment and report the
verdict in your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`af624a8`). `npm test` = 114/114, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly three files vs main:
   `src/main.ts`, `src/styles.css`, `test/e2e.test.ts`. Engine
   zero diff. Confirm by reading the diff: in styles.css the
   only change is the `.wrap` zoom declaration
   `zoom:clamp(1, calc(100vw / 1080px), 1.5)` plus its comment;
   in main.ts a `stageScale()` helper mirroring that clamp and
   compensation (divide by the factor) in exactly the two
   visual-rect-to-transform sites the builder names — the
   pile-mini FLIP (`endFx`) and drag tracking — and nothing
   else; no motion rules (Tasks 011/019) touched.
3. **Test-diff audit.** Exactly 1 new test, no removed or
   weakened assertions anywhere. The new test must genuinely
   pin: `stageScale()` at 360→1, 1080→1, 1440→4/3, 1620→1.5,
   2560→1.5, no-viewport→1; the shipped zoom declaration
   verbatim; the phone card rule (48px at ≤640px) unchanged;
   and both compensation sites present in source.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probe on the BUILT dist, using the patched harness pattern
   (Chrome for Testing 156.0.8078.80, sandbox ON, never
   `--no-sandbox`, localhost/file only), at the three task
   sizes, measuring — do not take the builder's numbers:
   - Phone 360×640: hand card 48px, no new scrolling, page
     metrics identical in kind to main's control build.
   - Laptop 1440×900: zoom ~1.333, hand card ~72px, stage
     fills the width, no horizontal scroll.
   - Very large 2560×1440: zoom 1.5, hand card exactly 81px,
     stage 1620 wide and centered with equal backdrop on
     both sides, no horizontal scroll.
   - Drag under zoom at 1440: drag a card a known visual
     distance and confirm tracking is 1:1 (residual ~0).
   - Screenshots at 2560 and 1440 viewed directly: stage big,
     proportional, crisp text, centered past the cap.
   Judge disclosure 1 explicitly: the spec's "54px at phone"
   vs the shipped phone presentation of 48px at ≤640px (the
   game's own media query, unchanged on main). Accept only
   if phone is byte-for-byte unregressed and the desktop base
   scales 54 → 72 → 81 as specified.
   Judge disclosure 2 explicitly: the fixed overlays (How to
   Play, odds card, start screen, banner) do NOT scale; they
   stay at current size, centered at every viewport, because
   their vh-based caps are Task 027's pinned shell. Accept
   only if the overlays still fit and center sensibly at all
   three sizes and Task 027's fits are intact (item 5) — the
   follow-up question of enlarging dialogs is John's, not a
   verifier fail if the locks hold.
5. **No collateral / locks surviving.** Task 027 at 1440: a
   fitting round-over banner shows no scrollbar on either
   edge, `.scrollbox` scroll == client on both axes. Task 022
   at 360×640: the odds card fits with scroll == client on
   both axes. Zero page errors everywhere. A full autopilot
   match completes on the PR build; game state identical in
   kind with scaling on/off; "chop" appears 0 times in dist
   player-facing strings.
