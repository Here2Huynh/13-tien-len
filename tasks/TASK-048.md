# TASK-048: Build/docs bundle — serve instructions, in-repo deploy + CI, self-hosted font, bundle cleanups, docs drift (audit #22–#26)

Status: ASSIGNED (builder). Suite baseline: 183.

## Why

Task 035 audit findings #22–#26 — the build/docs bundle, filed
as one task by the owner's walk-through ruling (2026-11-04):

- **#22** The README's "open dist/index.html in a browser" does
  not work — file:// blocks the module script (CORS), Start does
  nothing.
- **#23** No CI and no deploy script in the repo. Deploys are a
  manual foreman step living outside the repo; nothing ties a
  deployed artifact to a clean, tested commit.
- **#24** The "dependency-free" site loads Google Fonts at
  runtime — render-blocking, sends every player's IP to Google,
  and is the one external request every probe must abort.
- **#25** `src/engine/runner.js` ships in dist/ though nothing
  there imports it; the module graph loads in sequential hops
  with no modulepreload.
- **#26** Docs drift: repo AGENTS.md pipeline history stops at
  Switch #7; package.json description still says "scaffold +
  core card engine"; the README's bombs.ts line omits
  bomb-on-bomb; task-file naming switched conventions mid-stream
  undocumented.

## Scope
- **#22:** README — replace the open-the-file instruction with
  serving the folder (`python3 -m http.server -d dist` or
  `npx serve dist`). Wording only.
- **#23:** check in a deploy script (under `tools/deploy/` or
  `deploy/` — follow repo layout sense) that: refuses a dirty
  tree, runs `npm test` and `npm run build`, and deploys `dist/`
  tagged with the commit SHA, implementing the same Cloudflare
  Pages direct-upload flow the foreman uses today. Credentials
  come from the environment — **no token or secret is ever
  committed**; the script fails cleanly when they are absent.
  Also add a GitHub Actions workflow that runs `npm test` on
  pull requests — test-only, it never deploys.
- **#24:** self-host a Nunito woff2 subset (the weights the CSS
  actually uses, latin subset) in the repo, served next to
  styles.css; `@font-face` in CSS; the Google Fonts links leave
  index.html. The build copies the font files into dist/. After
  this task the page makes **zero external requests**. The font
  files are binary: commit them locally and flag in the report
  that the branch push needs the binary route (the foreman
  handles it at pickup). If the genuine Nunito subset cannot be
  sourced, stop and flag — never substitute a different font.
- **#25:** exclude the compiled `runner.js` from the shipped
  dist/ (the source stays; tests and headless sweeps compile
  separately and must stay green). Add `<link
  rel="modulepreload">` for the module graph to index.html.
- **#26:** repo AGENTS.md — bring the pipeline history current
  through Switch #10 (standing route: the Thirteen Builder /
  Thirteen Verifier chats; Claude Code reserved for the owner's
  other projects, out of this pipeline unless he re-opens it).
  package.json description reflects the real game. README
  bombs.ts line mentions bomb-on-bomb. Record the task-file
  naming convention (bare `TASK-NNN.md` since Task 032) in
  AGENTS.md — document it, do NOT rename existing files.

## Non-goals
- No gameplay, engine, UI-visual, or player-facing string
  changes. index.html changes are limited to the font links
  leaving and modulepreload arriving; rendered output must be
  unchanged (same font family, same weights in use).
- The deploy script is never run against production from the PR
  branch — its refusal/test/build behaviour is demonstrated,
  the upload step is reviewed, and the foreman's first real use
  is the post-merge deploy of this very task.
- No locked rule or design changes; the Task 034/037/045 CSS
  pins stay green.

## Rules
- Strict TS, zero `any`; suite count never drops; no assertion
  weakened (CSS pins compare parsed values since Task 047).
- Seeded equivalence spot-check vs main: the shipped JS changes
  only by runner.js's absence from dist/ — game behaviour
  identical.
- Option C probes as usual (patched 156.0.8078.80, localOnly,
  local dist, fresh profiles, sandbox OFF never claimed ON) —
  and after #24, a correct probe run should need to abort
  **nothing**: zero external requests attempted.

## Acceptance
- VERIFY-048 items all pass.
