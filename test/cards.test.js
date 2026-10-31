import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck,
  makeCard,
  compareCards,
  sortCards,
  rankValue,
  suitValue,
} from "../src/engine/cards.js";

test("deck is 52 unique cards", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test("rank order: 3 low, 2 high", () => {
  assert.equal(rankValue("3"), 0);
  assert.ok(rankValue("2") > rankValue("A"));
  assert.ok(rankValue("A") > rankValue("K"));
  assert.ok(rankValue("4") > rankValue("3"));
});

test("suit order: spades low, hearts high", () => {
  assert.ok(suitValue("spades") < suitValue("clubs"));
  assert.ok(suitValue("clubs") < suitValue("diamonds"));
  assert.ok(suitValue("diamonds") < suitValue("hearts"));
});

test("2 of hearts is the highest card, 3 of spades the lowest", () => {
  const sorted = sortCards(createDeck());
  assert.equal(sorted[0].id, "3-spades");
  assert.equal(sorted[sorted.length - 1].id, "2-hearts");
  assert.ok(compareCards(makeCard("2", "hearts"), makeCard("2", "diamonds")) > 0);
  assert.ok(compareCards(makeCard("2", "spades"), makeCard("A", "hearts")) > 0);
  assert.ok(compareCards(makeCard("3", "hearts"), makeCard("4", "spades")) < 0);
});
