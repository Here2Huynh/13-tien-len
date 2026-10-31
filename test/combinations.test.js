import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { detectCombination } from "../src/engine/combinations.js";

const c = makeCard;
const type = (cards) => detectCombination(cards)?.type ?? null;

test("single detected", () => {
  assert.equal(type([c("7", "clubs")]), "single");
});

test("pair detected", () => {
  assert.equal(type([c("7", "clubs"), c("7", "hearts")]), "pair");
});

test("triple detected", () => {
  assert.equal(
    type([c("9", "spades"), c("9", "clubs"), c("9", "hearts")]),
    "triple",
  );
});

test("four of a kind detected", () => {
  assert.equal(
    type([c("K", "spades"), c("K", "clubs"), c("K", "diamonds"), c("K", "hearts")]),
    "four-of-a-kind",
  );
});

test("straight detected: 3+ consecutive ranks", () => {
  assert.equal(
    type([c("3", "spades"), c("4", "hearts"), c("5", "clubs")]),
    "straight",
  );
  assert.equal(
    type([c("10", "spades"), c("J", "clubs"), c("Q", "diamonds"), c("K", "hearts"), c("A", "spades")]),
    "straight",
  );
  // Order of the input cards does not matter.
  assert.equal(
    type([c("6", "spades"), c("4", "clubs"), c("5", "diamonds")]),
    "straight",
  );
});

test("invalid combos rejected", () => {
  assert.equal(type([]), null);
  // Two different ranks is not a pair.
  assert.equal(type([c("7", "clubs"), c("8", "hearts")]), null);
  // Non-consecutive ranks is not a straight.
  assert.equal(type([c("3", "spades"), c("4", "hearts"), c("6", "clubs")]), null);
  // 2s are not allowed in straights.
  assert.equal(type([c("Q", "spades"), c("K", "hearts"), c("A", "clubs"), c("2", "diamonds")]), null);
  assert.equal(type([c("3", "spades"), c("4", "hearts"), c("2", "clubs")]), null);
  // Repeated rank is not a straight.
  assert.equal(type([c("4", "spades"), c("4", "hearts"), c("5", "clubs")]), null);
  // Two cards cannot be a straight.
  assert.equal(type([c("4", "spades"), c("5", "hearts")]), null);
  // Duplicate card is invalid.
  assert.equal(type([c("7", "clubs"), c("7", "clubs")]), null);
  // Pair plus a kicker is not a combination in scope.
  assert.equal(type([c("7", "clubs"), c("7", "hearts"), c("8", "spades")]), null);
});
