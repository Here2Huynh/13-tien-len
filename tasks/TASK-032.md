# TASK-032: Round-over banner — labeled PLACE / PLAYER / TOTAL / ROUND columns

Status: QUEUED (filed 2026-11-02; John's pick locked — see below)

## Owner feedback

John (2026-11-02, with a screenshot of the current banner): the round-over
screen's numbers are unlabeled — the middle column reads "score N" and the
right column shows the round gain, and in round 1 the two happen to be
identical so nothing distinguishes them; by mid-match (total 7, round +2)
a player cannot tell which number is the match total and which is what
they gained this round. His words: "improve this screen. maybe something
to indicate total score and the score for the round."

## Locked design (John's pick, 2026-11-02)

Mockups were prepared in the game's own style and reviewed by John. His
pick: **mockup A with a separate PLACE column** (reference image:
`~/workspace/13tl-mockups-roundover/mockup-a2.png`). Locked layout for the
round-over summary banner:

- Under the "Round over" title, a subline: **"ROUND N · FIRST TO 13"**
  (N = the round just finished; gold, small caps — explains the target
  once, up top).
- A header row in small letterspaced muted caps: **PLACE | PLAYER |
  TOTAL | ROUND**.
- One row per finisher, four columns:
  - **PLACE** — the ordinal (1st/2nd/3rd/4th) in its own left column.
  - **PLAYER** — the seat name (You/Mina/Kenji/Rosa).
  - **TOTAL** — the match total after this round, with a muted "/13"
    suffix (e.g. "7 /13").
  - **ROUND** — the signed points gained this round, green when
    positive, red when negative (colors as today).
- The Continue button and the banner's existing entrance behavior are
  unchanged.

## Amendment (John, 2026-11-02): medals in this view too

John, with a screenshot of this banner taken after Task 029 shipped:
"add the gold and silver medals in this view too — adjust the
existing ticket if it makes sense." It does: same screen, same
rendering pass, and this task was still queued, so the medals fold
in here rather than spawning a second banner task.

- The PLACE cell for 1st and 2nd renders Task 029's medal component —
  the same `.medal gold` / `.medal silver` disc markup and CSS the
  scoreboard uses (numeral in the disc, `role="img"`,
  `aria-label="Finished 1st"` / `"Finished 2nd"`). Reuse the shipped
  component; do not invent a second medal style.
- 3rd and 4th keep the plain ordinal text in the PLACE cell (no
  pills, no medals — top two only, same rule as Task 029).
- Semantics match Task 029: the medals mark this round's finish
  order, which is what these rows already are.
- Sizing: the banner rows are taller than the scoreboard's name row;
  the disc may render at its native size or scale modestly to sit
  well in the row — builder's call within the no-layout-shift rule,
  judged by the before/after screenshots below.

## Scope

- Presentation only, confined to the round-over summary banner (the
  `renderSummary` table in main.ts and its styles). The data already
  exists — the banner's rows carry the finish order, the running totals
  and the round deltas today. No scoring change, no engine change; final
  game state is identical with this change reverted.
- **Penalty rows keep working:** the per-player note rows (bomb
  penalties, leftover charges) that render under a player's line stay
  attached under that player's row in the new column layout.
- The instant-win and match-over banner variants keep their existing
  content. If the match-over banner shares this renderer, the same
  column treatment there is acceptable — note it in the PR either way.
- The Task 027 scroll container behavior is preserved; the banner still
  fits a 360×640 viewport (the Task 022 fit family). No animation is
  added, so reduced-motion needs no new handling.
- Accessible text is preserved ("Finished 1st" semantics stay available
  to assistive tech); the visual header row does not replace it.

## Proof bar

- Before/after phone screenshots (390×844) in the PR: (a) a mid-match
  round-over where totals differ from round gains (e.g. total 7, round
  +2), (b) a round-over that includes penalty note rows, both rendering
  in the locked four-column layout — and the "after" shots must show
  the gold medal on the 1st-place row and the silver on the 2nd, with
  plain ordinals on 3rd/4th.
- Tests as needed to pin the new structure (e.g. the header row, the
  "/13" total format, place in its own cell); suite grows from 105,
  count never drops, no weakened assertions.
- Full suite + build green; zero `any` in src/ and test/.
