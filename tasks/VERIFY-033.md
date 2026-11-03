# VERIFY 033 — instant-win celebration beat before the banner (PR #36)

Verifier: independent session (the Verifier chat, Switch #8). You
did not write this code. Judge the PR against TASK-033 (John's
locked pick: option B — dedicated beat before the banner +
stretched banner timings) and the claims in the PR body; do not
fix anything. Post PASS or FAIL with per-item evidence as a PR
comment on PR #36 and report the verdict in your chat.

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`529c874`). `npm test` = 121/121, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly 3 files vs main: `src/main.ts`,
   `src/styles.css`, `test/e2e.test.ts`. Engine zero diff.
   Presentation only: no engine, scoring, or phase/state change;
   final DOM and game state after the beat identical to before
   apart from the timing values and the winner-row pulse count.
3. **Test-diff audit.** Exactly 1 new test (120 → 121), zero
   removed or weakened assertions — judge disclosure 1
   explicitly: the TASK 027 test's one pin of the old banner
   burst declaration (`animation:burst .9s`) was updated to the
   new `burstHold` value with pins added. Accept only if every
   other 027 assertion is untouched, the new test genuinely pins
   beat content, banner withheld, no-replay on re-render, skip
   path, stale-timer no-op, timed handoff, second-summary
   replay, plain-round control, and the shipped CSS values,
   and nothing was weakened.
4. **Real-app probes — the decisive item.** Your OWN Playwright
   probes on the built dist under the Option C harness rules
   (patched Chrome for Testing 156.0.8078.80 only, probes load
   only locally built dist over localhost/file, every probe
   route-blocks ALL external requests via localOnly, sandbox-OFF
   is the accepted state — never claim sandbox-ON):
   - A scripted instant-win round: the beat appears BEFORE the
     banner — dimmed table, centered "INSTANT WIN!" headline,
     winner line "<Name> — <hand kind>" with the banner note's
     kind wording, gold burst behind the headline, stampIn
     entrance character.
   - Timing: beat appearance → banner visible ≈2.8s (±400ms);
     skip tap/click → banner visible <300ms; a re-render during
     the beat does NOT replay it or re-arm the timer (exactly
     one overlay, handoff from the original start).
   - Banner after handoff: existing instant-win content
     unchanged, banner burst visibly up with the new burstHold
     hold (~2.4s), winner row pulsing 4 beats.
   - Beat at 360×640: headline and winner line fit, no
     horizontal overflow. Reduced motion: no stamp/burst
     animation, text static, hold still ~2.8s, skippable.
   - Plain (non-instant-win) round control: no beat, no delay,
     banner exactly as before.
   - View the screenshots directly.
5. **No collateral.** Task 027 banner fit preserved (360×640,
   scroll == client); Task 032 banner columns/medals unchanged
   on non-instant rounds; a full autopilot match completes;
   "chop" appears 0 times in dist player-facing strings; zero
   page errors in probes. Judge disclosures 2–7 in the PR body
   against the code and your probes.

Verdict format: PASS or FAIL, per-item evidence. A FAIL names
the exact failing items.
