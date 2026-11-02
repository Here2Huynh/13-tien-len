# VERIFY 021 — Bomb on a bomb

Status: COMPLETE — **PASS** (Claude Code verifier, Opus 5.5 / high
effort, 2026-11-01). Verified locally on the builder commit before
any push, at the owner's order; verdict posted verbatim on PR #24.
Verifier probes preserved at `~/workspace/13tl-verify-021-probes/`
on the foreman's VM.

Verifier: Anthropic Claude via Claude Code, run by the foreman in
`~/workspace/13tl-verify-021` (fresh local checkout of the builder
commit — NOT the builder's tree). Builder: Muse sub-agent, commit
`2fc8e1c` on `task-021-bomb-on-bomb`, off main `8449d96`.

Rules: read repo `AGENTS.md` + `tasks/TASK-021-bomb-on-bomb.md`. You
verify; you never fix code and never touch the builder's clone.
Output is a PASS/FAIL verdict with per-item evidence — the foreman
posts it verbatim.

## Checklist

1. **Independent run.** `npm install`, `npm test`, `npm run build` on
   this checkout. Expect 96/96 (baseline 79; +17 tests). Review the
   test diff: additions only, no weakened or removed assertion.
2. **Scope.** Diff vs `8449d96` names exactly the 12 files the
   builder reported (engine bombs/trick/match/runner/ai, ui
   controller/model, main.ts, index.html, 3 test files) — nothing
   else, no other behavior change.
3. **Answer matrix** (probe the built engine directly, don't trust
   the shipped tests): over a bomb — higher same-kind answers;
   lower/equal does not; a 4-pair double run beats a 3-pair bomb
   and a four of a kind at ANY rank, and a higher 4-pair run beats a
   lower one; four of a kind does NOT answer a pair-run bomb; a
   3-pair run answers only a lower 3-pair run; non-bombs answer
   nothing here.
4. **Comebacks unchanged.** After passing, only a 4-pair run or a
   four of a kind may answer, on the player's own turn, against a
   post-pass play — including over bombs (a higher 3-pair run on a
   comeback turn must be rejected; a four of a kind over a pair-run
   bomb must be rejected; a four of a kind over a four-of-a-kind
   bomb must be accepted).
5. **Bombed-bomb penalty.** A beaten bomb's owner pays the beater
   exactly 1 point, applied instantly to match scores — flat, not
   per card; a LED four of a kind counts both ways (higher four of
   a kind, 4-pair run). Chains cascade with earlier payments
   standing. Pair of 2s bombed, then that bomb bombed = 2 pts + 1
   pt. Mutual exclusion: a bombed 2 is never charged the
   bombed-bomb point and vice versa. A played-and-bombed bomb is
   never also charged as an unused-bomb leftover (scripted round).
6. **Strings.** Log line matches the builder's claimed text —
   `Bomb penalty: <Payer> pay(s) 1 to <Payee> — <possessive> bomb
   was bombed.` with per-seat possessives. Cheatsheet: the three
   claimed additions present verbatim, worked example pays 1 + 1.
   The page contains no "chop" substring.
7. **Consistency.** Legal-play generation, the CPU's legal set,
   Hint, and the playable-bomb flicker all follow the new ladder;
   the Task 014 penalty float fires on bombed-bomb transfers.
8. **Divergence spot-check.** Re-run a sample of the builder's
   seeded sweep (its script is at `~/workspace/13tl-sweep-021c.mjs`)
   or your own equivalent: outcomes outside bomb-on-bomb paths must
   match main exactly; every divergence must start at a
   bomb-on-bomb play. Specifically re-check seeds 11 and 164.

FAIL = name the exact item and the evidence. No style notes, no
fixes, no code edits.
