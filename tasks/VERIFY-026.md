# VERIFY 026 — favicon v2, V4 card only (PR #34)

Verifier: independent Claude Code run (Switch #7). You did not
write this code. Judge the PR against TASK-026 (locked V4
artwork: card only, full frame, center heart ×1.3, assets
byte-identical to the locked masters) and the claims in the PR
body; do not fix anything. Post PASS or FAIL with per-item
evidence as a PR comment on PR #34 and write the same verdict
to the run's VERIFY-REPORT.md (path in your assignment).

## Checklist

1. **Independent run.** Fresh checkout of the PR head
   (`d218c2c`). `npm test` = 119/119, `npm run build` clean,
   tree clean afterwards.
2. **Locked artwork, byte-exact.** sha256 of the three shipped
   assets equals the locked masters:
   - favicon.svg (773 B): f44209786a4ec1fafc3e4d4bb6b4f16e223b1f172fe628bc7cd99108349cc680
   - favicon-32.png (1,230 B): 751a78224305f69c0cb7f9420d39b83dbecf3aa7a268e078a7705110d25a6e22
   - apple-touch-icon.png (13,120 B): b4f224c45f452256edf50e09ae493b4271dfb44aa705692508d20035aeaef44c
   The dist copies after build hash identically. favicon.svg
   is also byte-identical to the SVG block printed in
   tasks/TASK-026-favicon-v4.md.
3. **Diff discipline.** Exactly four files vs main: the three
   assets + `test/e2e.test.ts`. `index.html` and `build.mjs`
   zero diff (same filenames, same wiring). No src/ changes.
4. **Test-diff audit.** 3 new/extended icon tests as the PR
   describes; 0 removed lines in the test diff, no weakened
   assertions. Confirm the pins are genuine: hash assertions
   would fail on the old Task 020 assets (spot-check by
   hashing main's versions — they must differ).
5. **Artwork structure.** The shipped SVG: exactly one <rect>
   (the card), no gradient/defs/url(#), no background fill —
   transparent; card group scale 1.27 and big-heart scale 1.3
   transforms present. PNGs are RGBA, 32×32 and 180×180, with
   a transparent corner pixel.
6. **Serving check.** Load the built dist over localhost
   (route-block all external requests per the Option C
   harness rules in ~/AGENTS.md if you use the browser) or
   verify by file inspection: /favicon.svg, /favicon-32.png
   and /apple-touch-icon.png resolve from dist with the
   locked hashes, and the head links in dist/index.html point
   at them unchanged.

Verdict format: PASS or FAIL, per-item evidence, disclosures
accepted or disputed. A FAIL names the exact failing items.
