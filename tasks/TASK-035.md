# TASK-035: Full audit — codebase, game UI, and player experience

Status: FILED — audit only (no code changes); auditor route pending
the foreman's usage-gate call (Switch #9). Suite baseline: 122.

## Owner request

John (2026-11-04): "make ticket for claude to audit the whole
codebase and game ui and experience and list what should be
improved. and then i want you to review it too and report back
to me."

So this task has two stages: (1) an auditor produces the findings
report; (2) the foreman independently reviews the report —
spot-checking its claims against the code and a live play session —
and presents John a consolidated verdict with priorities. Nothing
in this task changes any code. Anything John picks from the
findings becomes its own scoped task through the normal pipeline.

## Audit scope

### A. Codebase
- Engine (src/engine/): correctness risks against the LOCKED rules
  in AGENTS.md (bomb ladder, comeback eligibility, scoring,
  penalties) — anywhere the implementation is fragile, convoluted,
  or under-tested rather than wrong (wrong = flag as a defect with
  a reproduction).
- UI layer (src/main.ts, styles.css, index.html): structure,
  duplication, state/render coupling, animation implementation,
  anything that makes future changes risky or slow.
- Tests: coverage gaps by area (what behavior has no test?),
  brittle or over-pinned assertions, suite runtime, missing
  end-to-end states.
- Build/deploy: the tsc/build.mjs pipeline, the self-deploy
  protocol, dependency posture (zero-runtime-dependency claim),
  anything stale in repo docs (AGENTS.md, README) versus reality.
- Performance: bundle size, render cost on a phone, animation
  jank risks.

### B. Game UI and player experience (play the real game)
Drive the built game (Option C probe harness, seed replays where
useful) through every state and judge it as a player:
- States: start screen, How to Play, Bomb Odds, early/mid/late
  round, bomb moments (playable + comeback), instant win (incl.
  the Task 033 beat), round-over banner, match-over, New Match.
- Viewports: 360×640 phone AND a desktop size.
- Judge: information clarity (whose turn, scores, penalties,
  what beats what), touch targets, readability/contrast,
  animation timing and feel, feedback when actions fail,
  consistency of components, reduced-motion experience,
  first-time-player learnability (does the game teach itself?).
- The owner-only open item (real-phone feel) can't be settled
  from a probe — note where probe evidence ends and a phone
  check would be needed, don't fake certainty.

## Deliverable

`~/workspace/13tl-runs/035/AUDIT-REPORT.md` — a numbered findings
list. Every finding carries:
- **Area** (Codebase / UI-UX / Tests / Build-Deploy),
- **Severity** (defect-risk / friction / polish),
- **Evidence** (file:line, command output, or a screenshot under
  ~/workspace/13tl-traces-035/audit/),
- **Suggested improvement** — concrete, and
- **Effort** (S / M / L).

Plus a closing section: the auditor's **Top 5 — do these first**,
ranked with one-line reasons.

## Constraints

- **Read-only.** No edits to any game file, test, or doc. The
  auditor works in its own clone and may build/probe it; it must
  finish with a clean tree at main's head.
- Locked rules and owner-locked design (modal/banners, medals,
  golden foil, gold ghost buttons, favicon) are NOT defects.
  A finding may note a cost or tension in a locked choice, but
  must label it LOCKED so it isn't mistaken for a free fix.
- No invented findings: if an area is healthy, say so in one line
  rather than padding the list. Every claim needs evidence.
- Probes follow Option C: patched CfT 156.0.8078.80 only,
  local dist only, route-block all external requests,
  sandbox-OFF is the accepted state (never claim ON).
