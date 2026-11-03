# TASK-033: Instant win — dedicated celebration beat before the banner

Status: ASSIGNED (verifier) — PR #36, head 529c874; builder local commit 59695dc. Filed 2026-11-03; John's pick locked (option B, see below). Suite baseline: 120 → 121.

## Owner feedback

John (2026-11-03): "make the instant win animation slower and longer
so it more obvious someone got the instant win."

What plays today (TASK 014): the results banner appears immediately,
carrying a one-shot gold burst behind the modal (0.9s, fades to
nothing) and the winner's row pulsing twice (~1.6s total). The whole
show is under 2 seconds and fires at the same moment the player is
still orienting to the deal — easy to miss entirely.

Options were presented (2026-11-03): A — stretch the current timings
only; B — a dedicated instant-win beat before the banner, then the
banner with stretched timings; C — longer timings plus a repeating
glow while the banner is up. **John picked B.**

## Locked design (John's pick, 2026-11-03 — option B)

When a round summary carries an instant win (roundEnd or matchEnd),
the banner is preceded by a dedicated full-screen beat:

1. **The beat.** A presentation overlay covers the table BEFORE the
   results banner appears:
   - The table behind it dims (semi-transparent dark backdrop).
   - Centered headline: **"INSTANT WIN!"** in large type.
   - Under it, the winner line: **"<Name> — <hand kind>"** (e.g.
     "Mina — dragon straight"), using the same kind wording as the
     banner's note (hyphens replaced with spaces).
   - Entrance uses the game's existing stamp language (the LOCKED
     stamp's `stampIn` character) and a gold burst behind the
     headline (reuse the `burst` keyframes, larger/longer than the
     banner's).
   - Total beat duration **~2.8s** from appearance to banner
     handoff (entrance ≈0.45s, the rest hold).
   - **Tap/click anywhere skips** immediately to the banner.
2. **The banner (after the beat).** The existing instant-win banner,
   unchanged in content, with the stretched timings:
   - Gold burst behind the modal: 0.9s → **~2.4s**, holding near
     full glow before fading (not a straight stretch — the glow
     must visibly linger).
   - Winner's row pulse: 2 beats → **4 beats** (~3.2s).
3. **Reduced motion:** no stamp scale, no burst; the beat shows its
   text statically for the hold (still skippable), per the standing
   rule that `prefers-reduced-motion` disables animation. The
   banner's burst/pulse stay disabled there as today.

## Scope

- Presentation only, in the UI layer (main.ts banner rendering +
  styles). **No engine change, no scoring change, no phase/state
  change:** the controller already sits at roundEnd/matchEnd; the
  beat only delays when the banner is painted. Final DOM and game
  state after the beat are identical to today apart from the timing
  values and the winner-row pulse count.
- **Plays once per instant-win round.** Re-rendering the same
  summary (e.g. a resize-triggered render) must NOT replay the
  beat — key it to the summary's identity, the same once-only
  discipline as the LOCKED stamp (TASK 028). A page reload mid-beat
  lands on the banner directly (the persisted scores from TASK 031
  restore the roundEnd state; the beat is a live-transition moment,
  not part of the save).
- The beat carries no exclusive information: the banner still shows
  the full note ("was dealt an instant-win hand… Everyone else
  pays 2"), the star row and the table exactly as today. When the
  instant win also ends the match, the banner title logic is
  unchanged ("Match over!").
- Fits a 360×640 viewport: the headline and winner line must fit a
  phone screen without overflow or layout shift.
- Non-instant-win rounds are untouched: no beat, no delay, banner
  exactly as today.

## Proof bar

- Probe screenshots (390×844, Option C harness) in the PR:
  (a) the beat mid-hold — dimmed table, "INSTANT WIN!" headline,
  winner line, burst visible; (b) the banner after handoff with
  the burst visibly up.
- A timing log from the probe: beat appearance → banner visible
  ≈2.8s within a stated tolerance; skip tap → banner visible
  <300ms after the tap; a re-render during/after the beat does
  not replay it.
- Tests as needed to pin the new structure (beat overlay content
  for a scripted instant-win summary, banner withheld during the
  beat and shown after, skip path, no-replay); suite grows from
  120, count never drops, no weakened assertions.
- Full suite + build green; zero `any` in src/ and test/.
