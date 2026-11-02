# TASK 020 — Site favicon: the 2♥ card

Status: ASSIGNED (builder)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner request (FR, design locked by the owner — do not redesign):
the site has no favicon, so browser tabs show the generic globe. Give
it a real icon: the 2 of hearts — the highest card in the game —
rendered as the locked "option C" artwork: a white card tilted −8° on
a rounded teal tile, red "2" and small heart at the card's top-left,
one large plain red heart at its center. **No numeral inside the big
heart** (an earlier revision had one; the owner rejected it — this is
the original C).

## The artwork (use exactly this SVG as `favicon.svg`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5560"/><stop offset="1" stop-color="#132c34"/></linearGradient></defs><rect width="512" height="512" rx="75" fill="url(#bg)"/><g transform="rotate(-8 256 256)"><rect x="136" y="72" width="240" height="368" rx="41" fill="#fdfdf8" stroke="#cfd4d6" stroke-width="4"/><text x="160" y="136" font-family="Nunito, Arial, sans-serif" font-size="70" font-weight="900" fill="#e0343f">2</text><path d="M50 88 C20 62 6 45 6 28 C6 13 17 5 30 5 C41 5 48 12 50 21 C52 12 59 5 70 5 C83 5 94 13 94 28 C94 45 80 62 50 88 Z" fill="#e0343f" transform="translate(155.5 151.2) scale(0.510)"/><path d="M50 88 C20 62 6 45 6 28 C6 13 17 5 30 5 C41 5 48 12 50 21 C52 12 59 5 70 5 C83 5 94 13 94 28 C94 45 80 62 50 88 Z" fill="#e0343f" transform="translate(253.0 289.0) scale(1.000)"/></g></svg>
```

## Required outcome

1. **Real icon files, shipped in `dist/`:** `favicon.svg` (the exact
   artwork above), `favicon-32.png` (32×32), and
   `apple-touch-icon.png` (180×180). The PNGs must be faithful renders
   of the same artwork (same tile, card, tilt, colors) — generate them
   from the SVG with whatever renderer your environment offers and
   disclose the tool in the PR; do not add any runtime dependency, and
   do not leave a new build dependency in `package.json` either —
   generation is a one-time authoring step, the committed PNGs are
   static assets like the SVG.
2. **`index.html`** links all three from `<head>`:
   `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
   `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`,
   `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`.
3. **`build.mjs`** copies the three assets into `dist/` alongside
   `index.html`, from wherever you keep the sources in the repo
   (repo root is fine — say where in the PR). The shipped site stays
   dependency-free.
4. Nothing else changes: no game code, no styles, no text. The word
   "Chop" appears nowhere; no player-facing strings are touched.

## Tests

Suite is 77 at `main`; it must not drop and no assertion may weaken.

- Add coverage in the existing static-check style (the e2e suite
  already reads `index.html` and the stylesheet from disk): assert the
  three link tags are present in `index.html`, and that a build leaves
  all three icon files in `dist/`.
- Verify the PNG dimensions in your own checks (32×32 and 180×180)
  and report them in the PR.

Branch `task-020-favicon` off `main`; open the PR against `main` and
report per `AGENTS.md`.
