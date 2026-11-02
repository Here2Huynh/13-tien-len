# TASK 027 — Summary modal shows scrollbars it doesn't need

Status: COMPLETE — PR #26 merged (989e95e) on the Verifier chat's PASS, deployed and live-verified 2026-11-02; suite 101 → 102.
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report: on desktop, the round/match summary modal (the
screenshot is the instant-win summary) shows BOTH a horizontal and
a vertical scrollbar even though the content easily fits.

## Root cause (foreman-traced in the shipped CSS; verify it)

1. `.modal.instantwin::before` (the Task 014 gold burst) is
   `position:absolute; inset:-34px` — it pokes 34 px out of the
   modal box on every side.
2. `.modal` sets `max-height:88vh; overflow-y:auto` and leaves
   overflow-x at its initial value. Per CSS, when one axis is
   non-`visible`, the other axis's `visible` computes to `auto`.
   The shell therefore scrolls on both axes, and the burst
   registers as overflow in both — hence two scrollbars on a
   summary that fits. The trap is latent for every banner using
   the shared `.modal` shell.

## The fix (owner's pick: surgical)

- The burst must no longer create overflow of the modal's scroll
  box. How is the builder's craft, within these bounds: the burst
  stays a one-shot 0.9 s gold radial glow behind the modal, visually
  unchanged (it already fades to transparent by 68% of its radius);
  `prefers-reduced-motion` behavior unchanged.
- The modal shell never scrolls horizontally — no modal, at any
  viewport, ever shows a horizontal scrollbar.
- Vertical scrolling stays available ONLY when content genuinely
  exceeds the 88vh cap (the How to Play cheatsheet on a short
  screen still scrolls; a fitting summary never shows a vertical
  scrollbar either — no visible scrollbar or scrollbar gutter on a
  modal whose content fits).

## Non-goals / non-regressions

- No changes to modal content, sizes, or colors; no animation
  changes beyond what stops the burst overflowing (Task 014's
  bundle otherwise untouched; burst timing/easing/gradient stops
  unchanged).
- The odds card's 360×640 fit and the cheatsheet's behavior are
  unchanged. Phone presentation unchanged.
- Engine untouched; CSS-first (touch `src/main.ts` only if the
  chosen technique truly requires it, and say why in the PR).

## Proof bar (the Task 022/023 lesson: probe the real built app)

- Real-browser layout probes on the built `dist/` at desktop size
  (e.g. 1280×800) and phone (360×640): for the round-summary,
  match-summary, and instant-win banners — `scrollWidth <=
  clientWidth` and `scrollHeight <= clientHeight` on the modal
  when content fits, and no horizontal scrollbar on ANY overlay
  (start gate, summaries, How to Play, Bomb odds).
- One probe where content genuinely exceeds the cap (short
  viewport, How to Play open): vertical scrolling still works and
  Close stays reachable.
- Suite green at 101+ with new assertions pinning the shipped CSS
  (earlier style-task pattern); `npm run build` clean.
