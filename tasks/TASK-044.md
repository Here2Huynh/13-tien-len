# TASK-044: Fast mode + skip to the end of the round (audit #13)

Status: ASSIGNED (builder). Suite baseline: 174.

## Why

Task 035 audit finding #13: matches are long and there is no speed
control. The CPU delay is a fixed 650 ms; a played round costs a
median ~35 s of CPU delay alone, and a typical match (median 23
rounds) runs about 15–25 minutes of mostly watching. After you
finish 1st you still wait a median ~9 s for the CPUs to play out
the round. The target of 13 is a LOCKED rule; the delay is not.

Owner ruling (2026-11-04 walk-through): build the audit's fix —
a Fast mode plus skip-to-end once you are out.

## Scope
- A speed setting with two modes, Normal and Fast, switchable
  during a match from the existing in-game UI (placement is the
  builder's choice — header or the ☰ menu — disclosed in the
  build report and consistent with the existing UI patterns):
  - Normal: today's pacing, unchanged (650 ms CPU delay).
  - Fast: CPU delay around 250 ms, and CPU passes resolve
    quicker than in Normal.
  The setting takes effect immediately (the next CPU action uses
  it) and the choice is remembered for the rest of the session;
  whether it also persists across reloads is the builder's
  disclosed choice. Default on a fresh load is Normal.
- "Skip to end": once the human seat has finished the round (out
  of the round, placing already decided for them), a control lets
  the player fast-forward the remaining CPU play of that round
  straight to the round-over banner. Skipping changes NOTHING
  about what is played: the same plays, scores, penalties, log,
  and round outcome as letting the round play out at any speed.
  The control is offered only while the human is out and CPUs are
  still playing; it disappears with the banner.
- Everything else about pacing is unchanged: the Task 033 beat,
  the Task 040 confirm freeze, banner timings, and all animation
  durations keep their locked values in both modes (Fast shortens
  CPU think/pass delays only, unless a timing is itself a CPU
  delay — disclose any judgment call).

## Non-goals
- No engine, scoring, rule, AI-policy, or save-format change. The
  CPU must make exactly the same decisions at any speed; speed
  and skip are pacing only.
- No change to the match target (first to 13) or any locked rule.
- No new modes beyond Normal/Fast (no custom delay slider).

## Rules
- Strict TS, zero `any`; suite count never drops; no existing
  assertion removed or loosened without a build-report disclosure.
- Equivalence: seeded full matches vs main — identical plays,
  scores, outcomes at Normal, at Fast, and with skip used at every
  opportunity; pacing is the only difference.
- Player-facing vocabulary: "Bomb penalty" only; the word "Chop"
  appears in no player-facing string.
- Option C probes: patched Chrome for Testing 156.0.8078.80,
  localOnly, locally built dist, fresh profiles, sandbox OFF.
  A full autopilot match takes ~35 min and outlives tool caps —
  use short seeded/scripted probes, never a full-match probe.
  Measure the Fast CPU delay from probe timestamps, not from
  reading the constant.

## Acceptance
- VERIFY-044 items all pass.
