# TASK 026 — Favicon v2: card only, full frame, bigger heart (V4)

Status: ASSIGNED (builder) — 2026-11-02, on the Task 025 close-out (owner FR 2026-11-01; design LOCKED — V4, the
owner's pick from rendered examples; becomes ASSIGNED (builder) in
queue order behind Tasks 022–025 unless the owner reorders)
Read `AGENTS.md` first; it governs how work flows in this repo.

Owner's FR: the Task 020 favicon (card on a teal tile) reads too
small — at tab size it's mostly tile. Make it bigger in the same
tilted style, just the card itself, no background. Four variants
were rendered at true 16/32 px sizes; the owner picked **V4: card
only, full frame, center heart enlarged ~30%** for 16 px clarity.

## The locked artwork

`favicon.svg` — 773 bytes, sha256 `f44209786a4ec1fa…` — ships
byte-for-byte as below (the Task 020 card art, frameless: card
group scaled 1.27 about the center, big heart at scale 1.3, no
tile, no gradient, transparent background):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 256) scale(1.27) translate(-256 -256)"><g transform="rotate(-8 256 256)"><rect x="136" y="72" width="240" height="368" rx="41" fill="#fdfdf8" stroke="#cfd4d6" stroke-width="4"/><text x="160" y="136" font-family="Nunito, Arial, sans-serif" font-size="70" font-weight="900" fill="#e0343f">2</text><path d="M50 88 C20 62 6 45 6 28 C6 13 17 5 30 5 C41 5 48 12 50 21 C52 12 59 5 70 5 C83 5 94 13 94 28 C94 45 80 62 50 88 Z" fill="#e0343f" transform="translate(155.5 151.2) scale(0.510)"/><path d="M50 88 C20 62 6 45 6 28 C6 13 17 5 30 5 C41 5 48 12 50 21 C52 12 59 5 70 5 C83 5 94 13 94 28 C94 45 80 62 50 88 Z" fill="#e0343f" transform="translate(238.0 275.0) scale(1.3)"/></g></g></svg>
```

PNG fallbacks, pre-rendered by the foreman from this master (soft
shadow baked in, as the owner's preview showed) — staged at
`~/workspace/13tl-build-026-assets/` on the foreman's VM:

- `favicon-32.png` — 1,230 bytes, sha256 `751a78224305f69c…`
- `apple-touch-icon.png` — 13,120 bytes, sha256 `b4f224c45f452256…`

## Scope

- Replace the three Task 020 asset files at their existing paths
  with the locked ones above. Head links and the `build.mjs` copy
  step do not change — same filenames, same wiring.
- The binary PNGs reach the branch via the foreman (connector
  pushes are text-only — the Task 020 route); the builder wires
  and tests everything else and names the expected PNG hashes in
  the PR.
- Update tests that pin the old artwork; add assertions: the
  shipped SVG contains no tile rect and no gradient, its background
  is transparent, and the dist copies match the sources.
- Nothing else changes — no other art, colors, or layout.

## Acceptance shape

- Suite green at whatever count it stands when this is assigned,
  no weakened assertions; `npm run build` clean; the live icons
  byte-verified against the locked hashes after deploy (the
  Task 020 pattern).
