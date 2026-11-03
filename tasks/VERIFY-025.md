# VERIFY 025 — utility buttons warm gold (PR #33)

Verifier: independent Claude Code run (Switch #7). You did not
write this code. Judge the PR against TASK-025 (the whole
button.ghost family goes warm gold from the trim; genuinely
disabled stays grey; distinct-color primaries keep theirs) and
the claims in the PR body; do not fix anything. Post PASS or
FAIL with per-item evidence as a PR comment on PR #33 and
write the same verdict to the run's VERIFY-REPORT.md (path in
your assignment).

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`2e3c4bd`). `npm test` = 116/116, `npm run build` clean,
   tree clean afterwards.
2. **Diff discipline.** Exactly two files vs main:
   `src/styles.css` and `test/e2e.test.ts`. Engine zero diff.
   In styles.css confirm: the gold tokens (`--gold-deep`,
   `--gold-ledge`, `--gold-ink`) derive from `--gold` #ffb223
   (same hue/saturation family); the ghost rules are scoped
   `button.ghost:not(#pass-btn)`; slate #486a73/#33525b are
   gone; the shared `button:disabled` wash is byte-identical;
   `#pass-btn` rule bodies are byte-identical to main.
3. **Test-diff audit.** Exactly 2 new tests, no removed or
   weakened assertions. The new tests must genuinely pin:
   the 8-button ghost inventory against shipped markup; ink
   contrast ≥ 4.5 on face and deep; white-on-gold < 3; the
   disabled rule ordered after hover/active with
   `grayscale(1)` and no gold; primaries (Play cards green,
   base button blue) unchanged.
4. **Real-app probes — the decisive item.** Your OWN probe on
   the BUILT dist, patched harness only (Chrome for Testing
   156.0.8078.80, sandbox ON, never `--no-sandbox`,
   localhost/file only), phone viewport 390×844:
   - Enabled ghosts (HINT/SORT/CLEAR + header trio) compute to
     gold rgb(255,178,35) with dark ink rgb(74,47,0).
   - HINT disabled off-turn computes grey + grayscale(1);
     PASS computes red rgb(239,62,74) in enabled, hover and
     disabled states — identical to a main control build.
   - Layout bounding boxes of the visible ghost buttons match
     the main control build; 0 page errors.
5. **Disclosure audit.** PR disclosures 1–7: confirm each
   against the code/probe evidence (esp. #1 PASS-red facts and
   #2 the eighth ghost `#help-btn-start`; START GAME beside it
   is not a ghost and stays blue). Disclosure 1's design
   question (PASS red vs gold) is the OWNER's ruling, pending
   separately — it is not yours to decide; note only whether
   the facts stated are accurate.
6. **Presentation-only invariant.** With the branch build vs a
   main control build under the same seeded deals, game state
   and DOM structure (ids/classes of game elements) are
   unchanged apart from the intended styles; no animation or
   transition added; `prefers-reduced-motion` behavior
   untouched.

Verdict format: PASS or FAIL, per-item evidence, disclosures
accepted or disputed. A FAIL names the exact failing items.
