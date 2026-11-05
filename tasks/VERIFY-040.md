# VERIFY-040: New Match confirmation — independent verification checklist

Verify PR #42 at its head against TASK-040 (audit #9). Builder
claim: New Match asks for confirmation while a match is in
progress (header, banner, and the phone ☰ menu item, which is the
same element); start gate and match-over stay one tap; cancel
preserves everything; the game freezes behind the dialog.
Suite 142 → 150.

1. **Independent run.** Fresh checkout of the PR head; `npm test`
   (expect 150, all pass), `npm run build` clean; tree clean after.
2. **Diff discipline.** 8 files: `index.html`,
   `src/dom/confirm.ts` (new), `src/dom/elements.ts`,
   `src/main.ts`, `src/styles.css`, `src/ui/model.ts`,
   `test/app.test.ts`, `test/e2e.test.ts`. No engine, controller,
   or persist changes. A confirmed New Match must clear the save
   and start fresh exactly as before (Task 039 behavior) — confirm
   from the diff that the fresh-start path is the old handler body.
3. **Gate correctness, from the code.** (a) Every path that starts
   a new match mid-play routes through the confirmation: header
   button, banner button, phone menu item (same element — verify
   there is no second copy). (b) The start-gate button never asks.
   (c) "In progress" = a match exists with no winner: check the
   predicate against the phases (idle / playing / round-over
   banner / match-over) — round-over asks, match-over does not.
   (d) Opening/cancelling the dialog calls no controller method,
   renders nothing, and touches no storage.
4. **Freeze correctness.** The CPU hold uses the controller's
   schedule injection: a timer due while the dialog is open must
   not run its callback, must not be dropped (a dropped timer
   hangs a CPU-led round), and re-arms on close either way.
   Read the mechanism and stress it in your probe (open the dialog
   with a CPU turn pending, wait past its delay, confirm no move;
   close and confirm the CPU then moves; also confirm-after-hold
   must not hang the fresh match).
5. **Test-diff audit.** 8 new tests. Disclosure 1: 16 existing
   header-click sites now go through a helper that confirms when
   the dialog opens, and the Task 037 menu test gained assertions.
   Judge: no assertion removed or loosened anywhere; the helper
   does not mask a case where the dialog SHOULD NOT appear (the
   one-tap cases must be covered by tests that assert no dialog).
6. **Probe (Option C, patched CfT 156.0.8078.80 only, localOnly,
   localhost dist only, fresh profile, scrollTo(0,0), sandbox OFF
   — do not claim ON).** On the PR dist: desktop header path and
   phone menu path — dialog appears with the correct standing
   line; state + save bytes frozen behind it for several real
   seconds with a CPU turn pending; Esc cancels, backdrop cancels,
   Keep playing cancels (focus returns to the opener); confirm
   clears the save and deals a fresh 0-0 round 1 that plays on.
   One full autopilot match completes with 0 page errors. If cheap,
   re-run the builder's seeded-equivalence claim on one seed.

Verdict: PASS or FAIL per item, with evidence.
