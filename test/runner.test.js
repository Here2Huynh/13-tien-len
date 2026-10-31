import test from "node:test";
import assert from "node:assert/strict";
import { playMatch, seededRng } from "../src/engine/runner.js";

test("seeded rng is deterministic", () => {
  const a = seededRng(42);
  const b = seededRng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2026];

for (const seed of SEEDS) {
  test(`full AI match, seed ${seed}: terminates, winner at 13+, zero-sum rounds, only legal plays`, () => {
    // playMatch drives the real engine: any illegal play would throw.
    const result = playMatch(seed);
    assert.notEqual(result.winner, null);
    assert.ok(result.scores[result.winner] >= 13);
    assert.ok(result.rounds.length > 0);
    for (const round of result.rounds) {
      assert.equal(round.deltas.length, 4);
      assert.equal(
        round.deltas.reduce((sum, d) => sum + d, 0),
        0,
        `round deltas must sum to zero (seed ${seed})`,
      );
    }
    // Final scores equal the sum of all round deltas.
    const totals = [0, 0, 0, 0];
    for (const round of result.rounds) {
      round.deltas.forEach((d, p) => {
        totals[p] += d;
      });
    }
    assert.deepEqual(result.scores, totals);
  });
}

test("same seed, same match: the runner is deterministic", () => {
  const a = playMatch(42);
  const b = playMatch(42);
  assert.equal(a.winner, b.winner);
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.rounds.length, b.rounds.length);
});
