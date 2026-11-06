# VERIFY-048 — checklist for the verifier (Task 048)

Verify PR for TASK-048 at its head. You did not write this code.
Builder report + evidence live in the run folder named in the
assignment.

1. Independent run: fresh clone at the PR head; npm test all
   pass (count >= 183), npm run build clean.
2. Zero external requests (decisive for #24): Option C probe
   (patched 156.0.8078.80, localOnly, locally built dist, fresh
   profile, sandbox OFF never claimed ON) loads the page and
   plays a scripted start — the route-blocker aborts NOTHING;
   no fonts.googleapis / fonts.gstatic request is attempted;
   text renders in Nunito from the self-hosted files (computed
   font-family + a screenshot at desktop and 360x640 that
   matches main's rendering).
3. Bundle (#25): dist/ contains no engine/runner.js, while the
   suite (which uses the runner via its own compile) stays
   green; index.html carries modulepreload links for the
   module graph; seeded spot-check vs main plays identically.
4. Deploy script (#23): in a scratch clone, the script refuses
   a dirty tree (demonstrated), fails cleanly with no
   credentials in the environment, and its test+build+SHA-tag
   flow reads correctly end to end. NO production deploy from
   the branch. No secret, token, or credential value appears
   anywhere in the diff.
5. CI (#23): the PR workflow exists, is valid YAML, runs
   npm test on pull requests, and contains no deploy step or
   secret usage beyond the default token.
6. Docs (#22 + #26): README serve instructions work as written
   (actually serve dist/ by the documented command and load
   the page); AGENTS.md history reaches Switch #10 and states
   the current standing route correctly; package.json
   description and the README bombs.ts line are accurate; the
   task-file naming convention is recorded; no existing task
   file was renamed.
7. Diff discipline: no gameplay/engine/visual change — engine
   and controller sources zero-diff except the build's runner
   exclusion plumbing; player-facing strings unchanged;
   index.html diff limited to font links out + modulepreload
   in; locked CSS pins (034/037/045) still pass as parsed
   values.
8. Font integrity: the committed woff2 files are genuine
   Nunito subsets for the weights the CSS uses (report how you
   checked — e.g. font metadata/family name), the build copies
   them into dist/, and the deployed-file list in a dry
   enumeration includes them.
9. Equivalence + hygiene: strict tsc clean, zero `any`; suite
   count never dropped; the probe from item 2 reports 0 page
   errors at both viewports.
