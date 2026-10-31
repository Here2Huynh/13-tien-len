import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import {
  detectBomb,
  detectPairSequence,
  isComebackBomb,
  bombBeats,
} from "../src/engine/bombs.js";

const c = makeCard;
const seq3 = () => [
  c("3", "spades"), c("3", "clubs"),
  c("4", "spades"), c("4", "clubs"),
  c("5", "spades"), c("5", "clubs"),
];
const seq4 = () => [
  ...seq3(),
  c("6", "spades"), c("6", "clubs"),
];
const seq5 = () => [
  ...seq4(),
  c("7", "spades"), c("7", "clubs"),
];
const fourKind = () => [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];
const single2 = () => [c("2", "hearts")];
const pair2 = () => [c("2", "spades"), c("2", "hearts")];
const triple2 = () => [c("2", "spades"), c("2", "clubs"), c("2", "hearts")];

test("bomb detection: each tier", () => {
  assert.equal(detectBomb(seq3())?.kind, "pair-sequence-3");
  assert.equal(detectBomb(seq4())?.kind, "pair-sequence-4");
  assert.equal(detectBomb(fourKind())?.kind, "four-of-a-kind");
  assert.equal(detectPairSequence(seq3())?.pairs, 3);
});

test("five consecutive pairs is NOT a bomb", () => {
  assert.equal(detectBomb(seq5()), null);
  assert.equal(bombBeats(seq5(), single2()), false);
});

test("pair sequence negatives", () => {
  // Not consecutive.
  assert.equal(
    detectBomb([
      c("3", "spades"), c("3", "clubs"),
      c("4", "spades"), c("4", "clubs"),
      c("6", "spades"), c("6", "clubs"),
    ]),
    null,
  );
  // 2s cannot take part in a pair sequence.
  assert.equal(
    detectPairSequence([
      c("K", "spades"), c("K", "clubs"),
      c("A", "spades"), c("A", "clubs"),
      c("2", "spades"), c("2", "clubs"),
    ]),
    null,
  );
  // A triple plus a pair is not a pair sequence.
  assert.equal(
    detectPairSequence([
      c("3", "spades"), c("3", "clubs"), c("3", "diamonds"),
      c("4", "spades"), c("4", "clubs"), c("5", "spades"),
    ]),
    null,
  );
});

test("every bomb tier beats a single 2", () => {
  assert.equal(bombBeats(seq3(), single2()), true);
  assert.equal(bombBeats(seq4(), single2()), true);
  assert.equal(bombBeats(fourKind(), single2()), true);
});

test("only the 4-pair run and four of a kind beat a pair of 2s", () => {
  assert.equal(bombBeats(seq3(), pair2()), false);
  assert.equal(bombBeats(seq4(), pair2()), true);
  assert.equal(bombBeats(fourKind(), pair2()), true);
});

test("triple 2s are unbeatable", () => {
  assert.equal(bombBeats(seq3(), triple2()), false);
  assert.equal(bombBeats(seq4(), triple2()), false);
  assert.equal(bombBeats(fourKind(), triple2()), false);
});

test("bombs only target 2s, and non-bombs never bomb", () => {
  assert.equal(bombBeats(seq4(), [c("A", "hearts")]), false);
  assert.equal(bombBeats(fourKind(), [c("A", "spades"), c("A", "hearts")]), false);
  assert.equal(bombBeats([c("3", "hearts")], single2()), false);
  assert.equal(bombBeats(seq4(), fourKind()), false);
});

test("comeback eligibility: four of a kind and 4-pair run only", () => {
  assert.equal(isComebackBomb(fourKind()), true);
  assert.equal(isComebackBomb(seq4()), true);
  assert.equal(isComebackBomb(seq3()), false);
  assert.equal(isComebackBomb(seq5()), false);
});
