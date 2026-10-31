import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { chooseAction, enumeratePlays, enumerateBombs } from "../src/engine/ai.js";
import { detectCombination } from "../src/engine/combinations.js";
import { detectBomb } from "../src/engine/bombs.js";

const c = makeCard;
const ids = (cards) => cards.map((card) => card.id).sort();

// A bare state where `player` is to act on `currentPlay` (or lead).
function actingState(hand, currentPlay = null, player = 0) {
  const hands = [[], [], [], []];
  hands[player] = hand;
  hands[(player + 1) % 4] = [c("9", "hearts"), c("10", "hearts")];
  hands[(player + 2) % 4] = [c("J", "hearts"), c("Q", "hearts")];
  hands[(player + 3) % 4] = [c("K", "hearts"), c("A", "hearts")];
  const state = createTrickState(hands, { leader: player, openingLead: false });
  state.currentPlay = currentPlay;
  return state;
}

test("enumeration covers singles, pairs, triples, quads, straights, bombs", () => {
  const hand = [
    c("3", "spades"), c("4", "clubs"), c("5", "diamonds"),
    c("7", "spades"), c("7", "clubs"),
    c("9", "spades"), c("9", "clubs"), c("9", "diamonds"),
    c("K", "spades"), c("K", "clubs"), c("K", "diamonds"), c("K", "hearts"),
  ];
  const types = new Set(enumeratePlays(hand).map((play) => detectCombination(play)?.type));
  assert.ok(types.has("single") && types.has("pair") && types.has("triple"));
  assert.ok(types.has("four-of-a-kind") && types.has("straight"));
  const bombKinds = new Set(enumerateBombs(hand).map((play) => detectBomb(play)?.kind));
  assert.ok(bombKinds.has("four-of-a-kind"));
});

test("on lead, the AI plays the lowest legal combination", () => {
  const state = actingState([c("9", "spades"), c("5", "clubs"), c("5", "diamonds"), c("K", "spades")]);
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  // Single 5 of clubs: highest card value 9, below the pair of 5s' 10.
  assert.deepEqual(ids(action.cards), ["5-clubs"]);
});

test("round-1 opening lead includes the 3 of spades, at its lowest", () => {
  const state = createTrickState([
    [c("3", "spades"), c("3", "hearts"), c("8", "clubs")],
    [c("9", "spades")],
    [c("10", "spades")],
    [c("J", "spades")],
  ]);
  assert.equal(state.openingLead, true);
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.deepEqual(ids(action.cards), ["3-spades"]);
});

test("on follow, the AI plays the lowest play that beats the current play", () => {
  const state = actingState(
    [c("8", "clubs"), c("9", "spades"), c("7", "hearts"), c("4", "spades")],
    { player: 3, cards: [c("7", "spades")], type: "single" },
  );
  const action = chooseAction(state, 0);
  // 7 of hearts beats 7 of spades on suit, and is lower than 8 or 9.
  assert.deepEqual(ids(action.cards), ["7-hearts"]);
});

test("the AI passes when nothing beats the current play", () => {
  const state = actingState(
    [c("K", "spades"), c("Q", "clubs")],
    { player: 3, cards: [c("2", "hearts")], type: "single" },
  );
  assert.deepEqual(chooseAction(state, 0), { type: "pass" });
  const pairState = actingState(
    [c("5", "spades"), c("5", "clubs"), c("K", "spades")],
    { player: 3, cards: [c("A", "spades"), c("A", "hearts")], type: "pair" },
  );
  assert.deepEqual(chooseAction(pairState, 0), { type: "pass" });
});

test("against a single 2, the AI bombs with the weakest sufficient bomb", () => {
  const run3 = [
    c("3", "clubs"), c("3", "diamonds"),
    c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const four8s = [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];
  const state = actingState(
    [...run3, ...four8s],
    { player: 3, cards: [c("2", "diamonds")], type: "single" },
  );
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(action.cards)?.kind, "pair-sequence-3");
});

test("against a pair of 2s, a 3-pair run is not sufficient: the 4-pair run is chosen over four of a kind", () => {
  const run3 = [
    c("3", "clubs"), c("3", "diamonds"),
    c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const run4extra = [c("6", "clubs"), c("6", "diamonds")];
  const four8s = [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];
  const state = actingState(
    [...run3, ...run4extra, ...four8s],
    { player: 3, cards: [c("2", "spades"), c("2", "hearts")], type: "pair" },
  );
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(action.cards)?.kind, "pair-sequence-4");
});

test("comeback turn: only comeback-legal bombs are used", () => {
  const run3 = [
    c("3", "clubs"), c("3", "hearts"),
    c("4", "diamonds"), c("4", "hearts"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const four9s = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
    [...run3, ...four9s],
    [c("2", "hearts"), c("K", "spades")],
    [c("6", "diamonds"), c("J", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1); // player 1 passes before the 2 lands
  playCards(state, 2, [c("2", "hearts")]);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1); // comeback turn
  const action = chooseAction(state, 1);
  assert.equal(action.type, "play");
  // The weaker 3-pair run is in hand but is not a legal comeback bomb.
  assert.equal(detectBomb(action.cards)?.kind, "four-of-a-kind");
});

test("comeback turn with only a 3-pair run: the AI passes", () => {
  const run3 = [
    c("3", "clubs"), c("3", "hearts"),
    c("4", "diamonds"), c("4", "hearts"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
    [...run3, c("8", "clubs")],
    [c("2", "hearts"), c("K", "spades")],
    [c("6", "diamonds"), c("J", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1);
  playCards(state, 2, [c("2", "hearts")]);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1);
  assert.deepEqual(chooseAction(state, 1), { type: "pass" });
});
