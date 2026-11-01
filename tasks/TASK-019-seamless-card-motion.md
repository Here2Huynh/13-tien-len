# TASK 019 — Hand cards: one seamless hover/select motion (desktop)

Status: ASSIGNED (builder)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner report (desktop, mouse): hovering and selecting hand cards
feels fidgety — the card jitters between poses instead of moving in
one smooth motion. Fix the motion, not the look: the resting tilt,
the hover lift, and the selected lift all stay; they must stop
fighting each other.

## What is wrong today (foreman's trace of src/styles.css)

- Hover pose: `translateY(-7px) rotate(0deg) scale(1.05)` — from
  `.hand button.card:hover` at specificity (0,3,1), inside the
  `@media (hover:hover) and (pointer:fine)` block.
- Selected pose: `translateY(-15px) rotate(0deg)`, no scale — from
  `.hand .card.sel` at (0,3,0). For a real button card, **hover
  outranks selected**, so a selected card under the mouse shows the
  hover pose, and slides to the selected pose only when the pointer
  leaves — selected cards bob as the pointer crosses them, and a
  click produces a two-stage settle instead of one motion.
- The two poses also disagree on scale and draw their box-shadows
  from different rules, so transform and shadow never move as one.
- The generic `button` rules (transition .08s, :hover brightness,
  :active press) still leak into the cascade around hand cards and
  must not contribute any transform/filter/shadow while a hand card
  is hovered, pressed, or selected.

## Required outcome

1. **One pose per state, one winner.** Rest (nth-child tilt), hover,
   and selected poses are each defined once. Selected outranks
   hover: a selected card holds the selected pose whether the
   pointer is over it or not. Hovering an unselected card, clicking
   to select, moving off, and deselecting each produce a single
   continuous glide — no pose is ever visited twice in one gesture.
2. **One motion system.** All hand-card state changes share a
   single transition spec (one duration, one easing, covering
   transform and box-shadow together), so every path — rest→hover,
   hover→selected, selected→rest, hover→rest — is the same kind of
   motion. Keep it snappy (the current .13s neighborhood).
3. **The look does not change.** Resting tilts, the −7px hover lift
   with scale(1.05), and the −15px selected lift (blue ring shadow,
   #e8f5ff face) stay as they are. The selected pose may adopt the
   hover scale if that is what makes the path continuous — if you
   change any pose value, disclose it in the PR and say why.
4. **No cross-talk.** While a hand card is in any of these states,
   no generic `button` declaration (the .08s transition, :hover
   brightness filter, :active press transform/shadow) may affect
   its transform, filter, or box-shadow.

## Hard constraints (do not regress)

- TASK 011: hover rules stay inside `@media (hover:hover) and
  (pointer:fine)`; no :active lift exists for hand cards; a
  deselected card on touch rests exactly at its tilt.
- Drag: `.dragging` keeps `transition:none` and full control of the
  transform; FLIP/settle animations from Task 014 (WAAPI) must not
  be fought by the new transitions.
- Bomb flicker/glow and the comeback foil animate opacity/filter/
  box-shadow only and keep working on hovered and selected cards
  (note `.bombhot.sel` keeps its red ring).
- Presentation only: no engine, controller, model, or log changes;
  final DOM/state identical, feature on or off. Expected diff:
  `src/styles.css` + tests. Anything more needs a disclosed reason.

## Tests

Suite is 76 at `main`; it must not drop and no assertion may weaken.

- Add coverage that pins the cascade outcome: the selected pose
  wins over hover for button hand cards (e.g. a CSS-level test in
  the style of the existing pile-height test — parse the stylesheet
  and assert the winning declarations per state), and that the
  hand-card transition spec is a single shared one.
- The acceptance evidence is a real-browser probe (the verifier
  will repeat it): scripted pointer over a hand card in Chromium —
  rest → hover → click (selected) → pointer leaves → pointer
  returns → deselect — sampling the computed transform during each
  leg. Each leg must be a single monotonic glide to its pose: no
  direction reversals, no intermediate stop at another state's
  pose, and while selected the transform must not change at all as
  the pointer enters/leaves. Include the probe results in the PR.

Branch `task-019-seamless-card-motion` off `main`; open the PR
against `main` and report per `AGENTS.md`.
