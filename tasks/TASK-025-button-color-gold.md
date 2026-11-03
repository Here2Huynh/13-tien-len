# TASK 025 — Utility buttons: warm gold (stop reading as disabled)

Status: ASSIGNED (verifier) — PR #33 open, head 2e3c4bd; builder run (Claude Code) commit 77544d8; foreman pickup verified 116/116 + build clean. Owner ruling pending on Disclosure 1 (PASS stays red vs goes gold) — merge waits for it. (Originally assigned to the builder 2026-11-02 after the Task 024 close-out; owner pick locked 2026-11-01: warm gold.)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, with screenshot: the HINT / SORT / CLEAR buttons'
flat slate-grey "doesn't appear" enabled — it reads as greyed-out /
disabled. Fix: recolor them **warm gold**, matching the gold trim
line that already runs under the button row (owner's pick over
vivid teal and coral red).

Scope extended by the owner 2026-11-01 (second screenshot, same
complaint): the header's HOW TO PLAY / NEW MATCH buttons too. The
slate style is one class — `button.ghost` (#486a73) — and its full
family in the shipped markup is: PASS, HINT, SORT, CLEAR (controls
row) and HOW TO PLAY, BOMB ODDS, NEW MATCH (header, `.ghost.small`).
All of them get the gold treatment under this task.

## Scope

- Every `button.ghost` element (the seven buttons named above) —
  the builder confirms the inventory against the shipped markup,
  lists it in the PR, and recolors exactly those. Buttons with
  their own distinct colors (Play cards' green, the start/dialog
  primaries) keep them.
- Derive the gold from the trim's actual value in the CSS: button
  face in that gold family, a deeper gold for hover/pressed. Text
  stays clearly legible against the gold (dark text if that's what
  contrast requires).
- **Genuine disabled states must still read as disabled.** If any
  of these buttons can actually be disabled, its disabled state
  keeps a desaturated/grey treatment — the fix removes the
  disabled *look* from enabled buttons without destroying the
  signal for real disabled ones.
- CSS/presentation only. No behavior, label, or layout changes;
  Tasks 011/019 motion rules untouched.

## Acceptance shape

- Tests assert the new button colors in the shipped CSS (the
  pattern earlier style tasks used), suite green at whatever count
  it stands when this is assigned, no weakened assertions.
- Before/after screenshots at phone size in the PR, plus the
  foreman's live check after deploy.
