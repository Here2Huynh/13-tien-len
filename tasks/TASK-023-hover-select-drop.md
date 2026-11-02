# TASK 023 — Fix the card hover/select drop

Status: ASSIGNED (verifier) — PR #27 open, branch
task-023-hover-select-drop; built in the Builder chat (commit
d307161: suite 102 -> 103, real-app traces 28/28 claimed);
verifier route: the Verifier chat — the fresh Claude usage check
at verify time could not be completed (Anthropic usage endpoint
returned HTTP 429), so availability was unproven and the chat
fallback runs it per the owner's rule (Switch #5). Checklist:
tasks/VERIFY-023.md.
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, in his words: he doesn't love the card animation on
hover and on select — "it makes an unnecessary drop down after
selecting." The hand-card motion shipped by Task 019 (seamless
hover/select transitions) reads as: lift on hover, lift on select,
then an extra downward dip before the card settles. That dip is the
defect. The fix removes it; the motion should go directly to the
selected pose and stay there.

## Diagnosis (consultation run, 2026-11-01 — proven on the real app)

The dip is NOT CSS. On every selection change, `render()` rebuilds
the hand's DOM (`els.hand.textContent = ""`), so Task 019's CSS
transition never runs on the same element; meanwhile the Task 014
"hand settle" FLIP animation reads the pose change as a position
change and runs a 260 ms transform animation that replaces the
card's pose. Measured on the built app: a phone tap drops the card
**15 px below rest**, rises to rest, then snaps to selected;
desktop hover→click drops 15 px and ends below rest; Hint dips too.
Blocking that one animation removes the dip. (Task 019 missed it
because its probe used a fake hand and never loaded the real app
loop; unit-test fakes report zero boxes, so the settle never fires
in tests.)

## The fix (owner's pick: FULL — all three steps)

1. The settle animation compares **layout positions**
   (`offsetLeft`/`offsetTop`, transform-blind), so select /
   deselect / Hint / Clear never trigger it; real moves animate the
   separate CSS `translate` property so poses survive slides (this
   also fixes selected cards dropping their lift during Sort). The
   pile fly-out keeps using painted boxes.
2. **Reuse card buttons across hand redraws** (match by card id) so
   Task 019's transition actually glides hover↔selected on the same
   element.
3. Add `.hand .card { transition: none !important }` to the
   reduced-motion block. DISCLOSED test impact: a Task 019 test
   expects exactly 2 hand rules containing `transition:` — update
   that expectation to match, with the change named in the PR; no
   other assertion weakens.

## Non-negotiables (from Tasks 011 / 019)

- No pose VALUES change: rest tilt, hover `translateY(-7px)
  rotate(0) scale(1.05)`, selected `translateY(-15px)`, the shared
  `transform .13s ease` transition, and the selected-outranks-hover
  order all stay exactly as shipped.
- Hover lift stays inside its `@media (hover:hover) and
  (pointer:fine)` guard (Task 011).
- Drag, the playable-bomb flicker, and the comeback foil are
  untouched. `prefers-reduced-motion` still disables the motion.
- No other animation changes: deal, bomb juice, pass/lockout,
  penalty float are out of scope.
- Engine untouched; presentation layer only (`src/main.ts` /
  `src/styles.css`).

## Proof bar (the consultation's standard — real app, not fakes)

- Frame traces on the real BUILT app (Playwright/headless Chromium
  against `dist/`, loading the real `main.ts` loop): desktop
  hover→select→deselect, phone tap select/deselect, Hint, Clear,
  and Sort with a card selected (lift held every frame). Criterion:
  **no downward reversal > 0.5 px and never below rest** on any
  path; same-element assertion for the reused card buttons; a
  reduced-motion run.
- A new unit test with non-zero fake boxes so the settle logic is
  covered in the suite (the zero-box blind spot is what hid this).
- Suite green (101+, no weakened assertions beyond the disclosed
  Task 019 test update); `npm run build` clean.
- The owner's real-phone feel check remains the final word, as
  with Tasks 011/019.
