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
  in the locked four-column layout.
- Tests as needed to pin the new structure (e.g. the header row, the
  "/13" total format, place in its own cell); suite grows from 105,
  count never drops, no weakened assertions.
- Full suite + build green; zero `any` in src/ and test/.
