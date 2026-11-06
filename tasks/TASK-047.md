# TASK-047: Tests bundle — fixture the slow enumeration, close coverage gaps, un-pin CSS text (audit #19 + #20 + #21)

Status: COMPLETE — PR #49 merged 2fb3619 (verifier PASS, all 9
VERIFY-047 items, head b0ddc31), deployed c47de109-b6b3-4adb-ad9f-d9dab1efab1d.
Suite 180 -> 183.

## Why

Task 035 audit findings #19, #20, #21 — the tests bundle, filed
as one task by the owner's walk-through ruling (2026-11-04):

- **#19 One test is ~96% of the suite's runtime.** "bomb odds:
  the enumeration covers every dealt hand…" took ~30 s of a ~31 s
  suite. Every builder and verifier loop pays it.
- **#20 Coverage gaps by behaviour.** Several engine behaviours
  had no test. Two of the audit's five gaps are already closed by
  later tasks — restored-round leader (Task 046) and dead
  comeback turns (Task 038) — do not duplicate them. The "e2e"
  suite runs on a hand-written fake DOM, so layout regressions
  cannot fail npm test; the probe harness lives outside the repo.
- **#21 CSS assertions are over-pinned.** Tests pin exact
  declaration strings, keyframe whitespace, and even a CSS
  comment, so harmless reformatting fails. Values guarding
  LOCKED designs stay pinned — as parsed values, not raw text.

## Scope
- **#19:** the bomb-odds test's enumeration result becomes a
  checked-in fixture that the default suite compares against —
  same assertions, same expected values. The full enumeration
  stays runnable behind an env flag (documented in the test
  file), out of the default run. **The fixture must be proven,
  not trusted:** run the full enumeration once during this task
  and show in the build report that it reproduces the fixture
  exactly. Report before/after default-suite wall time.
- **#20 — add engine tests for the gaps that remain:**
  - two instant-win hands in one deal: the priority loop picks
    the correct winner per the locked rules, and the round ends
    with the locked payout (every other player pays 2);
  - a save reaching 13 mid-round: pin the CURRENT behaviour for
    a save whose scores cross the target mid-round (the locked
    rules check the target at round end — whatever the engine
    does today is the spec; if it looks wrong against the locked
    rules, stop and flag rather than assert around it);
  - the banner identity TOTAL = previous TOTAL + ROUND (+ the
    Task 042 note reconciling mid-round penalties) — only if a
    genuine test gap remains after reading what Tasks 042/046
    already cover; say so in the report either way.
  - Check a minimal Option C probe script into the repo (e.g.
    `tools/probe/`, NOT part of npm test): patched Chrome for
    Testing 156.0.8078.80 path, localOnly route-blocking, loads
    only locally built dist, fresh profile — so verifiers run
    the same smoke/layout checks every time. Document its usage
    in the script header.
- **#21:** CSS assertions compare parsed declaration values;
  comment-text and whitespace/keyframe-formatting checks are
  dropped. LOCKED design values (Task 034 V1 gradient stops,
  Task 037 phone measurements, Task 045 AA tokens, Task 032/042
  banner rules) remain pinned as parsed values.

## Non-goals
- **No production code changes.** `src/` is untouched by this
  task; the diff is tests, the fixture, and `tools/` only. If a
  new coverage test FAILS against current production code, stop
  and flag it — a failing new test is a finding (a possible real
  defect), never something to fix inside this task or to assert
  around.
- No assertion anywhere is removed or loosened in strength:
  #21 changes HOW css values are compared (parsed, not raw
  text), never WHAT values are required.
- No gameplay, UI, or string changes of any kind.

## Rules
- Strict TS, zero `any`; suite count grows by the new coverage
  tests and never drops otherwise.
- Seeded equivalence spot-check vs main (the suite itself plus a
  short seeded run) — production code is untouched, so outcomes
  must be identical by construction; show it anyway.

## Acceptance
- VERIFY-047 items all pass.
