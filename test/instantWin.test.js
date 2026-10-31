import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { detectInstantWin } from "../src/engine/instantWin.js";

const c = makeCard;
const kind = (hand) => detectInstantWin(hand)?.kind ?? null;

test("four 2s", () => {
  const hand = [
    c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts"),
    c("3", "spades"), c("5", "clubs"), c("7", "diamonds"), c("9", "spades"),
    c("J", "clubs"), c("K", "diamonds"), c("A", "spades"), c("4", "hearts"), c("6", "hearts"),
  ];
  assert.equal(kind(hand), "four-2s");
});

test("six pairs (non-consecutive, so no other kind fires)", () => {
  const hand = [
    c("3", "spades"), c("3", "clubs"),
    c("5", "spades"), c("5", "clubs"),
    c("7", "spades"), c("7", "clubs"),
    c("9", "spades"), c("9", "clubs"),
    c("J", "spades"), c("J", "clubs"),
    c("K", "spades"), c("K", "clubs"),
    c("A", "diamonds"),
  ];
  assert.equal(kind(hand), "six-pairs");
});

test("five consecutive pairs", () => {
  const hand = [
    c("3", "spades"), c("3", "clubs"),
    c("4", "spades"), c("4", "clubs"),
    c("5", "spades"), c("5", "clubs"),
    c("6", "spades"), c("6", "clubs"),
    c("7", "spades"), c("7", "clubs"),
    c("9", "spades"), c("J", "clubs"), c("K", "diamonds"),
  ];
  assert.equal(kind(hand), "five-consecutive-pairs");
});

test("dragon straight 3 through A", () => {
  const hand = [
    c("3", "spades"), c("4", "clubs"), c("5", "diamonds"), c("6", "hearts"),
    c("7", "spades"), c("8", "clubs"), c("9", "diamonds"), c("10", "hearts"),
    c("J", "spades"), c("Q", "clubs"), c("K", "diamonds"), c("A", "hearts"),
    c("3", "clubs"),
  ];
  assert.equal(kind(hand), "dragon-straight");
});

test("three consecutive triples", () => {
  const hand = [
    c("4", "spades"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "spades"), c("5", "clubs"), c("5", "diamonds"),
    c("6", "spades"), c("6", "clubs"), c("6", "diamonds"),
    c("8", "spades"), c("10", "clubs"), c("Q", "diamonds"), c("K", "spades"),
  ];
  assert.equal(kind(hand), "three-consecutive-triples");
});

test("near misses are not instant wins", () => {
  // Only three 2s, everything else singletons, no dragon (no 10 or Q).
  assert.equal(kind([
    c("2", "spades"), c("2", "clubs"), c("2", "diamonds"),
    c("3", "spades"), c("5", "clubs"), c("7", "diamonds"), c("9", "spades"),
    c("J", "clubs"), c("K", "diamonds"), c("A", "spades"),
    c("4", "hearts"), c("6", "hearts"), c("8", "hearts"),
  ]), null);

  // Five pairs, but not consecutive and not six.
  assert.equal(kind([
    c("3", "spades"), c("3", "clubs"),
    c("5", "spades"), c("5", "clubs"),
    c("7", "spades"), c("7", "clubs"),
    c("9", "spades"), c("9", "clubs"),
    c("J", "spades"), c("J", "clubs"),
    c("K", "spades"), c("A", "clubs"), c("4", "diamonds"),
  ]), null);

  // Four consecutive pairs only.
  assert.equal(kind([
    c("3", "spades"), c("3", "clubs"),
    c("4", "spades"), c("4", "clubs"),
    c("5", "spades"), c("5", "clubs"),
    c("6", "spades"), c("6", "clubs"),
    c("8", "spades"), c("10", "clubs"), c("Q", "diamonds"), c("K", "hearts"), c("A", "spades"),
  ]), null);

  // Dragon missing the A.
  assert.equal(kind([
    c("3", "spades"), c("4", "clubs"), c("5", "diamonds"), c("6", "hearts"),
    c("7", "spades"), c("8", "clubs"), c("9", "diamonds"), c("10", "hearts"),
    c("J", "spades"), c("Q", "clubs"), c("K", "diamonds"),
    c("3", "clubs"), c("K", "hearts"),
  ]), null);

  // Two consecutive triples only.
  assert.equal(kind([
    c("4", "spades"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "spades"), c("5", "clubs"), c("5", "diamonds"),
    c("7", "spades"), c("7", "clubs"),
    c("9", "spades"), c("J", "clubs"), c("K", "diamonds"), c("A", "spades"), c("3", "spades"),
  ]), null);

  // Four 2s but only 12 cards: detection is at deal, whole 13-card hand.
  assert.equal(kind([
    c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts"),
    c("3", "spades"), c("5", "clubs"), c("7", "diamonds"), c("9", "spades"),
    c("J", "clubs"), c("K", "diamonds"), c("A", "spades"), c("4", "hearts"),
  ]), null);
});
