import test from "node:test";
import assert from "node:assert/strict";
import { createDeck } from "../src/engine/cards.js";
import { shuffle, deal, newDeal } from "../src/engine/deal.js";

// Deterministic rng for tests.
function seededRng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("deal is 4 hands of 13, no cards left over", () => {
  const hands = deal(createDeck());
  assert.equal(hands.length, 4);
  for (const hand of hands) assert.equal(hand.length, 13);
  const all = hands.flat();
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((c) => c.id)).size, 52);
});

test("shuffle keeps 52 unique cards and does not mutate the input", () => {
  const deck = createDeck();
  const shuffled = shuffle(deck, seededRng(42));
  assert.equal(shuffled.length, 52);
  assert.equal(new Set(shuffled.map((c) => c.id)).size, 52);
  assert.deepEqual(deck, createDeck());
  assert.notDeepEqual(
    shuffled.map((c) => c.id),
    deck.map((c) => c.id),
  );
});

test("newDeal deals a full shuffled deck", () => {
  const hands = newDeal(seededRng(7));
  assert.equal(hands.length, 4);
  assert.equal(hands.flat().length, 52);
  assert.equal(new Set(hands.flat().map((c) => c.id)).size, 52);
});

test("deal rejects a deck that is not 52 cards", () => {
  assert.throws(() => deal(createDeck().slice(0, 51)));
});
