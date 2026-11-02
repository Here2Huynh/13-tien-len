# VERIFY 020 — Site favicon: the 2♥ card

Status: ASSIGNED (verifier)
Read `AGENTS.md` first. Verify the PR for branch `task-020-favicon`
against `main` (Task 020). Start from a fresh checkout of the PR head
and record the head SHA your verdict covers. Never fix, never edit
code, never merge, never deploy.

Disclosure up front: the two PNG assets were rendered by the foreman
from the owner's locked 512px master of the approved "option C"
artwork and supplied to the builder unchanged (the builder sandbox
has no image renderer). That is expected — your job includes checking
the PNGs really are that artwork.

## Checklist

1. **Diff scope is exactly six files:** `index.html`, `build.mjs`,
   `test/e2e.test.ts`, `favicon.svg`, `favicon-32.png`,
   `apple-touch-icon.png`. Nothing else — no `src/`, no styles, no
   `package.json`, no player-facing strings.
2. **`favicon.svg` is the locked artwork:** byte-identical to the SVG
   embedded in `tasks/TASK-020-favicon.md` (920 bytes).
3. **PNGs are correct and faithful:** `favicon-32.png` is 32×32,
   `apple-touch-icon.png` is 180×180, and both render the same
   artwork as the SVG — teal gradient tile, white card tilted −8°,
   red "2" and small heart top-left, one large plain red heart at
   center, **no numeral inside the big heart**.
4. **`index.html`** `<head>` carries the three exact link tags from
   TASK-020 (SVG icon, 32×32 PNG icon, 180×180 apple-touch-icon).
5. **`build.mjs`** copies all three assets into `dist/`; after
   `npm run build`, `dist/` contains all three, byte-identical to
   their repo sources.
6. **Suite:** `npm install` + `npm test` — at least 79 tests
   (77 baseline + the new favicon coverage), all passing. Diff the
   test file against `main`: additions only, no assertion weakened
   or removed.
7. The word "Chop" appears nowhere in the diff.

Report PASS or FAIL with evidence (head SHA, counts, commands, what
you probed) as a comment on the PR, or to the foreman if your session
cannot post.
