# TASK-034: Bomb foil — rainbow sheen becomes golden foil (V1)

Status: ASSIGNED (verifier) — built by a Claude Code builder run (Switch #9; local commit 7147702, branch pushed as f9db7a2), foreman re-run 122/122 + build clean; PR #37 open; VERIFY-034 below.

## Owner feedback

John (2026-11-04, with a video of his hand — a 3-pair double-run
bomb carrying the live-bomb foil): "when the bomb hint glint have
a golden sparkle so it more obvious."

What plays today: cards in the `.bombhot` state (live comeback
bombs) carry a holographic foil sweep — a `::after` gradient in
pink/blue/pale-yellow ("Balatro holographic sheen") over a gold
ring and glow. In play the rainbow barely registers; the glint
reads as a pale wash, not as "this is a bomb."

Mockups were prepared on the real game (a comeback state: four 4s
live against a played 2♠, seed 38 replay —
`~/workspace/13tl-mockups-sparkle/capture.mjs`): baseline plus
three golden directions. **John picked V1 "Golden foil"**
(2026-11-04). The button-color FR from the same session was
cancelled by John and is NOT part of this task.

## Locked design (John's pick, 2026-11-04 — V1)

Change exactly one thing: the `.hand .card.bombhot::after` foil
gradient goes from the rainbow stops to golds only, with the band
wider and brighter — the exact gradient John approved in the
mockup:

```css
background:linear-gradient(115deg, transparent 24%, rgba(184,119,0,.35) 37%,
  rgba(255,178,35,.72) 47%, rgba(255,246,200,.95) 54%,
  rgba(255,178,35,.72) 61%, rgba(184,119,0,.35) 70%, transparent 82%);
```

(184,119,0 is the --gold-ledge family, 255,178,35 is --gold; the
peak 255,246,200 is the pale white-gold. Express the stops however
the stylesheet's existing conventions allow — the rendered values
must match these.)

Everything else about the treatment is unchanged:

- The sweep itself: same 115deg angle, same `@keyframes foil`
  path and 1.6s timing, same `inset:-40%` geometry.
- The gold ring + `bombglow` pulse on `.bombhot` — unchanged.
- The `bombflicker` on `.bombplayable` and the combined
  `.bombhot.bombplayable` animation slots — unchanged.
- The `.bombhot.sel` selected treatment — unchanged.
- Card faces stay fully readable under the sweep (the mockup was
  verified for this; the build must preserve it).
- `prefers-reduced-motion` behavior — unchanged (all of this
  animation is already disabled there).
- The stale "Balatro holographic sheen" comment should be updated
  to describe the golden foil — comments must not describe a
  rainbow that no longer exists.

## Scope

- Presentation only, confined to the one gradient (plus its
  comment) in src/styles.css. No engine change, no markup change,
  no timing change; final game state is identical with this change
  reverted.
- If any existing test pins the old rainbow gradient values,
  update that pin to the new values and say so as a disclosure —
  do not silently edit pins.
- No other button or color work (the button-color FR was
  cancelled by the owner; the gold `button.ghost` family from
  TASK 025 stays exactly as it is).

## Proof bar

- Probe evidence (Option C harness) in the PR: an animated GIF
  or frame sequence of a live `.bombhot` state (the seed-38
  comeback replay in `~/workspace/13tl-mockups-sparkle/capture.mjs`
  reaches it) showing the gold band sweeping the bomb cards,
  plus a computed-style read of the `::after` gradient showing
  no pink/blue stops remain.
- Tests as needed to pin the new gradient; suite grows from 121
  or holds with pin updates only — count never drops, no weakened
  assertions.
- Full suite + build green; zero `any` in src/ and test/.

## VERIFY-034 (verifier: independent fresh clone of PR #37 head f9db7a2)

1. In a fresh clone of head f9db7a2: `npm test` reports the FULL
   suite (122 tests, 0 failures) and `npm run build` exits 0.
   Re-derive the expected diff vs main yourself — exactly 2 files
   (src/styles.css, test/e2e.test.ts) — and confirm engine and
   markup diffs are zero and the styles diff contains nothing but
   the gradient + comment hunks.
2. The shipped gradient IS John's approved V1, value for value:
   the `.hand .card.bombhot::after` background in the built CSS
   equals the gradient printed in this task file; a computed-style
   probe read finds NO pink/blue stop (every non-transparent stop
   has r ≥ g ≥ b), and the old rainbow values
   (255,120,200 / 120,220,255 / 255,235,150) appear nowhere in the
   stylesheet.
3. Nothing else about the treatment moved: `@keyframes foil`, the
   1.6s sweep timing and `inset:-40%` geometry, the gold ring +
   `bombglow`, the `bombflicker` slots, `.bombhot.sel`, the
   reduced-motion rules, and ALL button rules are byte-identical
   to main (show the evidence from the diff or targeted greps).
   The word "holographic" no longer appears in styles.css.
4. Live behavior on the built dist (Option C probe): reach a
   .bombhot state (seed-38 comeback replay: START, human passes
   once; four 4s bombhot against Rosa's played 2) and capture a
   GIF or frame sequence showing the GOLD band sweeping the bomb
   cards; the ring/glow pulse still runs; judge Disclosure 3
   explicitly — at the band's peak the small top-left rank index
   fades for about one frame: state whether faces remain
   "readable" in the sense of the approved mockup (John approved
   these exact values on the animated mockup), and give your
   reasoning either way. A full autopilot match completes.
5. Rules untouched: no engine edit exists to check beyond item 1;
   confirm the new test is a pure addition (suite 121 → 122, no
   existing assertion changed — diff the test file).

Verdict format: post the verdict as a PR #37 comment ("PASS —
VERIFY-034" or "FAIL — VERIFY-034", items 1–5 marked) AND write
the same verdict to ~/workspace/13tl-runs/034/VERIFY-REPORT.md.
