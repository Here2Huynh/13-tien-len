# VERIFY-038: Dead comeback turns — independent verification checklist

Verify PR #40 at its head against TASK-038. Builder claim: a comeback
turn is offered only when live; dead turns auto-decline; zero outcome
change. Suite 125 → 134.

1. **Independent run.** Fresh checkout of the PR head; `npm test`
   (expect 134, all pass), `npm run build` clean; working tree clean
   afterwards.
2. **Diff discipline.** Exactly 4 files: `src/engine/comeback.ts`
   (new), `src/ui/controller.ts`, `test/app.test.ts`,
   `test/engine.test.ts`. No changes to `trick.ts`, `bombs.ts`,
   `ai.ts`, `runner.ts` or any `src/dom/*` file. The controller's
   decline uses the engine's own `passTurn` and writes no log line,
   makes no emit, adds no CPU delay (read the diff and confirm).
   The comeback answer computation must use the same legality test
   a real comeback play faces (isComebackBomb + the bomb ladders) —
   confirm by reading `comeback.ts` against `trick.playCards`.
3. **Test-diff audit.** 9 new tests; the ONE modified existing
   fixture (TASK 016 "a pass that closes the trick…") is disclosed:
   the human was given four 9s so the tested decline is a live one;
   its assertion is unchanged and two assertions were added. Judge:
   no assertion weakened anywhere; the old dead-turn path is covered
   by the new auto-decline tests. Run the builder's mutation logic
   yourself if cheap: disabling the decline call must fail tests.
4. **Equivalence, independently.** Reproduce the core claim with
   your OWN harness or by re-running the builder's scripts from a
   clean state: over ≥20 controller seeds, old actions minus the
   dead passes == new actions exactly; final states equal; live
   comeback turns offered equal (incl. seed 38). Separately confirm
   the sweep headline: offered dead turns after = 0, live offered
   unchanged (a reduced sweep, e.g. 500 matches, is acceptable if
   the method matches the audit's).
5. **Probe (Option C, patched CfT 156.0.8078.80 only, localOnly,
   localhost dist only, fresh profile, sandbox OFF — do not claim
   ON).** On the PR dist: a seeded replay that previously stopped
   the human on a dead comeback turn (builder used seeds 23/39)
   now flows past with no "your turn" render on a locked-out hand;
   the seed-38 live comeback still stops, offers the bomb via Hint,
   and plays with the bomb-penalty line. One full autopilot match
   completes with 0 page errors.

Verdict: PASS or FAIL per item, with evidence. A false negative —
any genuinely live comeback no longer offered — is a FAIL.
