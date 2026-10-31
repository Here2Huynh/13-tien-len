import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { createTrickState } from "../src/engine/trick.js";
import {
  cardLabel,
  sortHand,
  validateSelection,
  emptyTrickView,
  applyToTrickView,
  describePlay,
  roundResultRows,
  scoreRows,
} from "../src/ui/model.js";

const c = makeCard;

test("cardLabel maps suits to glyphs and colors", () => {
  assert.deepEqual(cardLabel(c("2", "hearts")), {
    rank: "2", suit: "hearts", glyph: "♥", text: "2♥", color: "red",
  });
  assert.equal(cardLabel(c("3", "spades")).color, "black");
  assert.equal(cardLabel(c("3", "spades")).text, "3♠");
  assert.equal(cardLabel(c("Q", "diamonds")).color, "red");
  assert.equal(cardLabel(c("Q", "clubs")).color, "black");
});

test("sortHand orders low to high without mutating the input", () => {
  const hand = [c("2", "hearts"), c("3", "spades"), c("K", "clubs")];
  assert.deepEqual(sortHand(hand).map((x) => x.id), ["3-spades", "K-clubs", "2-hearts"]);
  assert.equal(hand[0].id, "2-hearts");
});

test("validateSelection: turn, emptiness, and hand membership", () => {
  const state = createTrickState([
    [c("3", "spades"), c("9", "clubs")],
    [c("4", "spades")],
    [c("5", "spades")],
    [c("6", "spades")],
  ]);
  assert.equal(validateSelection(state, 0, [c("3", "spades")]).ok, true);
  assert.match(validateSelection(state, 0, []).error, /at least one card/);
  assert.match(validateSelection(state, 1, [c("4", "spades")]).error, /not your turn/);
  assert.match(validateSelection(state, 0, [c("A", "hearts")]).error, /not in your hand/);
  assert.equal(validateSelection(null, 0, []).ok, false);
});

test("trick view reducer records plays and passes; a comeback play overwrites a pass", () => {
  let view = emptyTrickView();
  view = applyToTrickView(view, { type: "pass", player: 1 });
  assert.deepEqual(view.entries[1], { type: "pass" });
  view = applyToTrickView(view, { type: "play", player: 2, cards: [c("7", "spades")] });
  assert.equal(view.entries[2].cards[0].id, "7-spades");
  view = applyToTrickView(view, { type: "play", player: 1, cards: [c("9", "spades")] });
  assert.equal(view.entries[1].type, "play");
});

test("describePlay phrases engine detections, bombs first", () => {
  assert.equal(describePlay([c("K", "spades")]), "single K♠");
  assert.match(describePlay([c("7", "spades"), c("7", "hearts")]), /pair/);
  assert.match(
    describePlay([c("3", "spades"), c("4", "clubs"), c("5", "diamonds")]),
    /straight/,
  );
  assert.match(
    describePlay([
      c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"),
      c("4", "diamonds"), c("5", "clubs"), c("5", "diamonds"),
    ]),
    /BOMB — 3-pair/,
  );
});

test("describePlay: a four of a kind is a bomb only when it functioned as one", () => {
  const quad = [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];
  // Led, or played as a plain combination: plain phrasing, no BOMB.
  assert.equal(describePlay(quad), "four of a kind, high card 8♥");
  assert.equal(describePlay(quad, false), "four of a kind, high card 8♥");
  // Played against a single 2 / pair of 2s via the bomb path: a bomb.
  assert.equal(describePlay(quad, true), "a BOMB — four of a kind");
});

test("roundResultRows and scoreRows map places, deltas, and the leader", () => {
  const rows = roundResultRows([2, 0, 3, 1], [1, -2, 2, -1]);
  assert.deepEqual(
    rows.map((r) => [r.name, r.place, r.delta]),
    [["Kenji", "1st", 2], ["You", "2nd", 1], ["Rosa", "3rd", -1], ["Mina", "4th", -2]],
  );
  const scores = scoreRows([5, 12, 12, -3]);
  assert.deepEqual(scores.map((s) => s.isLeader), [false, true, true, false]);
  assert.equal(scoreRows([0, 0, 0, 0]).every((s) => !s.isLeader), true);
});
