# TASK 025 — Utility buttons: warm gold (stop reading as disabled)

Status: QUEUED (owner pick locked 2026-11-01: warm gold; becomes
ASSIGNED (builder) in queue order behind Tasks 022–024 unless the
owner reorders)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's report, with screenshot: the HINT / SORT / CLEAR buttons'
flat slate-grey "doesn't appear" enabled — it reads as greyed-out /
disabled. Fix: recolor them **warm gold**, matching the gold trim
line that already runs under the button row (owner's pick over
vivid teal and coral red).

## Scope

- The utility-row buttons (HINT, SORT, CLEAR) and any other button
  sharing that exact slate style — the builder inventories every
  element using the style, lists them in the PR, and recolors
  exactly those. Buttons with their own distinct colors (primary
  actions, dialogs) keep them.
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
