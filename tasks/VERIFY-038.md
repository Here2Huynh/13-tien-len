# VERIFY 038 — no more dead comeback turns, audit #1 (PR #40)

Verifier: independent session (Claude Code run, Switch #9; the
Verifier chat is the fallback). You did not write this code.
Judge the PR against TASK-038 (John's locked scope: a comeback
turn is offered only when live; dead turns auto-decline with
ZERO outcome change; locked comeback rules unchanged) and the
claims in the PR body / build report; do not fix anything.
Post PASS or FAIL with per-item evidence as a PR comment on
PR #40 and write the verdict to the VERIFY-REPORT.md path named
in your prompt.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`e55edde`). `npm test` = 134/134, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly 4 files vs main:
   `src/engine/comeback.ts` (new), `src/ui/controller.ts`,
   `test/app.test.ts`, `test/engine.test.ts`. The locked files
   `src/engine/trick.ts`, `src/engine/bombs.ts`,
   `src/engine/ai.ts`, `src/engine/runner.ts` are zero diff.
   No presentation files touched (`src/main.ts`, `src/dom/*`
   zero diff). No rule, eligibility, or scoring change: the
   comeback helper must apply the same legality test
   `trick.playCards` applies (comeback-eligible kinds only,
   `bombBeats || bombOnBombBeats` the table play).
3. **Test-diff audit.** Exactly 9 new tests (125 → 134).
   Judge build disclosure 1 explicitly: one TASK-016 fixture
   was re-pointed — the human was given four 9s so the decline
   it tests is a live one; its assertion ("You passes.") is
   unchanged and two assertions were added. Accept only if
   that is the sole existing-test change and no assertion
   anywhere was removed or weakened.
4. **Independent equivalence (the decisive item).** Re-derive
   the zero-outcome-change claim with your OWN harness on your
   OWN builds of base (main) and head (do not reuse the
   builder's scripts or outputs): seeded controller-level
   matches (at least 20 seeds; include seeds 38/56/101),
   classifying dead turns by the audit's method from engine
   primitives. Required: the new build's action sequence,
   log lines, and states equal the old build's with exactly
   the auto-declined passes removed — each auto-decline
   matched 1:1 to an old forced pass (round, trick, player,
   table play) — and NO other diff. The game log of the new
   build must be an exact subsequence of the old build's.
5. **Own sweep.** Audit method, ≥1,000 matches: offered dead
   comeback turns AFTER = 0; live turns offered unchanged vs
   BEFORE on the same seeds; BEFORE reproduces the audit's
   proportions (builder at 3,000 matches: dead 205,651,
   live 1,378). Report your own counts, not the builder's.
6. **False-negative hunt (FAIL-grade risk).** A live comeback
   turn silently skipped is the worst failure mode. Prove
   live turns still stop and offer: four of a kind AND the
   4-pair run against a 2; the seed-38 replay (four 4s vs
   Rosa's 2♠, Hint names the bomb, bomb plays, penalty line
   follows); bomb-vs-bomb comeback answers (higher quad over
   a quad, 4-pair run over any bomb) still offered. Triple 2s
   never open a turn, for any hand.
7. **Option C probes — your OWN.** Playwright on the built
   dist under the Option C harness rules (patched Chrome for
   Testing 156.0.8078.80 only, probes load only locally built
   dist over localhost/file, every probe route-blocks ALL
   external requests via localOnly, sandbox-OFF is the
   accepted state — never claim sandbox-ON):
   - a seeded replay that produced a dead human comeback
     turn on the old build (builder used seeds 23 and 39)
     now flows past it — no "YOUR TURN" stop on a locked-out
     hand without a live bomb;
   - a live comeback replay (seed 38) still stops and
     offers the bomb;
   - a full autopilot match completes; zero page errors.
8. **Disclosures judged.** Rule on each build-report
   disclosure against the code and your own evidence:
   #2 (the check lives in the controller, not the engine
   gate — accept only if the log-subsequence property in
   item 4 holds and you agree the engine-level P7 counts
   staying unchanged is by design, not a miss);
   #3 (the task file's "~54% triple 2s" is unsupported —
   the audit's P7 reports deadOnTriple2s: 0; confirm from
   your sweep data); #4 (harness choices: mixed policy is
   harness-only, real-speed probes); #5 (presentation and
   How to Play copy untouched — confirm by diff).

Verdict format: PASS or FAIL, per-item evidence. A FAIL names
the exact failing items.
