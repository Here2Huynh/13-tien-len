# VERIFY-046 — checklist for the verifier (Task 046)

Verify PR for TASK-046 at its head. You did not write this code.
Builder report + evidence live in the run folder named in the
assignment. This is a pure refactor: the bar is that NOTHING
observable changes.

1. Independent run: fresh clone at the PR head; npm test all pass
   (count >= 179), npm run build clean.
2. Single source (decisive): the bomb-answer predicate, the
   acted-as-a-bomb predicate, and the play -> penalties sequence
   each exist exactly once, in the engine, and every former site
   (engine internals, AI, controller, runner, adapter glow and
   flicker) calls the shared implementation. Grep for hand-rolled
   copies of the bomb-ladder comparison outside the engine and
   find none.
3. Honest typing: no `as number` cast remains on the leader or
   trick-winner paths; the leader's type is explicitly nullable;
   strict tsc clean, zero `any` anywhere in src/ and test/.
4. Test-diff audit: no existing assertion removed or loosened;
   moved/renamed tests match the build report's list exactly;
   the restored-match leader test exists and pins CURRENT
   behavior (3♠ holder leads a restored round).
5. Equivalence (decisive): seeded full matches vs main — plays,
   scores, per-round summaries, and full logs byte-identical
   across a seed set the verifier picks, including bomb answers,
   comeback bombs, and bomb-vs-bomb chains; bomb and bombed-bomb
   penalty transfers reconcile to the point, identical to main.
6. Diff discipline: refactor + tests only. No player-facing
   string, CSS, banner, beat, or save-format change; "Bomb
   penalty" still the only term, "Chop" nowhere player-facing.
7. Divergence check: if the builder's report flags any duplicate
   that differed, confirm the difference is preserved (not
   unified away) or was ruled on — an unflagged silent
   unification fails this item.
8. Restored-match behavior: a save/restore round trip at the PR
   head plays out identically to main (same leader, same first
   play requirements, same outcome on the same seed).
9. Option C probe (smoke): patched Chrome for Testing
   156.0.8078.80, sandbox OFF (never claimed ON), localOnly,
   locally built dist, fresh profiles: one scripted bomb scenario
   and one match end, desktop 1280x800 and phone 360x640 —
   0 page errors. Short seeded/scripted probes only; a full
   autopilot match (~35 min) outlives tool caps — do not attempt
   one.
