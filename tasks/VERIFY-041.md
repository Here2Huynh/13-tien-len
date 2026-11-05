# VERIFY-041 — checklist for the verifier (Task 041)

Verify PR for TASK-041 at its head. You did not write this code. Builder
report + evidence live in the run folder named in the assignment.

1. Independent run: fresh clone at the PR head; npm test all pass (count
   >= 151), npm run build clean.
2. Diff discipline: changes confined to presentation/copy — controller/model
   log-line conjugation, an error-copy mapping in the presentation layer,
   index.html How to Play text + close control, overlay dialog attributes/
   focus handling, styles for the error state, and tests. Engine files
   (src/engine/) zero diff. No rule/scoring/save change.
3. Test-diff audit: every changed assertion corresponds to an approved copy
   change listed in the build report (grammar, error copy, How to Play
   wording, aria labels) and changes nothing else; no assertion removed or
   loosened; suite count did not drop.
4. Grammar: seeded or scripted play produces "You play / You pass / You
   lead / You take it" and the instant-win line reads "You were dealt…";
   CPU lines unchanged ("Mina plays…" etc.).
5. Error copy: trigger the mapped rejections (play that does not beat the
   trick; leading a bomb; illegal comeback attempt) — the shown text is the
   new player copy, names the table state where claimed, and is visually
   distinct from a hint (own style/class). An unmapped engine error still
   surfaces (fallback works).
6. How to Play: pair runs no longer listed as a leadable set; leftover line
   says last pays 1st; "Five consecutive pairs" naming consistent with the
   odds card; top close control present; Esc closes the sheet; focus
   returns to the opener.
7. A11y: Sort aria-labels read correctly both directions; How to Play and
   Bomb odds overlays expose role="dialog" aria-modal="true", take focus on
   open, close on Esc, return focus; the log has aria-live="polite";
   Task 040's confirm dialog behavior is unregressed (open/freeze/Esc/
   focus return still work — run its regression test).
8. Equivalence: seeded full match vs main — identical plays, scores, and
   outcomes; differences confined to text. Presentation-only: state
   identical with the new styles/classes stripped.
9. Option C probe (patched Chrome for Testing 156.0.8078.80 only, localOnly,
   locally built dist on localhost, fresh profile, sandbox OFF): screenshots
   or DOM reads showing an error state vs a hint state, the How to Play top
   close + Esc close, and overlay focus behavior.
