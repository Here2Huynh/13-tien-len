import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { beats, canBeat, comparePlays, highestCard } from "../src/engine/plays.js";

const c = makeCard;

test("must be the same combination type", () => {
  assert.equal(beats([c("8", "spades")], [c("7", "hearts")]), true);
  assert.equal(beats([c("8", "spades"), c("8", "clubs")], [c("7", "hearts")]), false);
  assert.equal(
    beats([c("9", "spades"), c("9", "clubs"), c("9", "diamonds")], [c("8", "hearts"), c("8", "clubs")]),
    false,
  );
  assert.equal(comparePlays([c("8", "spades")], [c("7", "spades"), c("7", "clubs")]), null);
});

test("must be the same card count", () => {
  const s3 = [c("3", "spades"), c("4", "clubs"), c("5", "diamonds")];
  const s4 = [c("4", "spades"), c("5", "clubs"), c("6", "diamonds"), c("7", "hearts")];
  assert.equal(beats(s4, s3), false);
  assert.equal(beats(s3, s4), false);
  assert.equal(comparePlays(s4, s3), null);
});

test("higher rank beats, lower rank does not", () => {
  assert.equal(beats([c("4", "spades")], [c("3", "hearts")]), true);
  assert.equal(beats([c("3", "hearts")], [c("4", "spades")]), false);
  assert.equal(beats([c("2", "spades")], [c("A", "hearts")]), true);
  assert.equal(
    beats([c("6", "spades"), c("6", "clubs")], [c("5", "diamonds"), c("5", "hearts")]),
    true,
  );
});

test("suit breaks a tie on the highest card", () => {
  assert.equal(beats([c("3", "hearts")], [c("3", "spades")]), true);
  assert.equal(beats([c("3", "spades")], [c("3", "hearts")]), false);
  assert.equal(beats([c("3", "diamonds")], [c("3", "clubs")]), true);
  // Pair of 5s: the pair with the hearts on top wins.
  assert.equal(
    beats([c("5", "spades"), c("5", "hearts")], [c("5", "clubs"), c("5", "diamonds")]),
    true,
  );
  assert.equal(
    beats([c("5", "clubs"), c("5", "diamonds")], [c("5", "spades"), c("5", "hearts")]),
    false,
  );
  // Equal plays do not beat.
  assert.equal(beats([c("7", "hearts")], [c("7", "hearts")]), false);
});

test("straights compare by their highest card, suit included", () => {
  const low = [c("3", "spades"), c("4", "clubs"), c("5", "hearts")];
  const higherRank = [c("4", "spades"), c("5", "clubs"), c("6", "spades")];
  const sameRankHigherSuit = [c("3", "clubs"), c("4", "diamonds"), c("5", "hearts")];
  assert.equal(beats(higherRank, low), true);
  assert.equal(beats(low, higherRank), false);
  // Same top rank (5): both end on 5 of hearts here, so no beat either way
  // via the other cards — comparison is by the highest card only.
  const endsHearts = [c("3", "diamonds"), c("4", "spades"), c("5", "hearts")];
  assert.equal(beats(endsHearts, sameRankHigherSuit), false);
  const endsDiamonds = [c("3", "spades"), c("4", "clubs"), c("5", "diamonds")];
  const endsHeartsTop = [c("3", "spades"), c("4", "clubs"), c("5", "hearts")];
  assert.equal(beats(endsHeartsTop, endsDiamonds), true);
  assert.equal(beats(endsDiamonds, endsHeartsTop), false);
});

test("invalid plays never beat, canBeat is beats", () => {
  assert.equal(beats([c("9", "spades"), c("8", "clubs")], [c("3", "spades")]), false);
  assert.equal(beats([c("3", "spades")], []), false);
  assert.equal(canBeat([c("8", "spades")], [c("7", "hearts")]), true);
  assert.equal(highestCard([c("3", "hearts"), c("4", "spades")]).id, "4-spades");
});
