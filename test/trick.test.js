import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { createDeck } from "../src/engine/cards.js";
import { deal } from "../src/engine/deal.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";

const c = makeCard;

// Small scripted hands. Player 1 holds 3 of spades.
function scriptedHands() {
  return [
    [c("4", "spades"), c("8", "hearts"), c("9", "clubs"), c("K", "spades")],
    [c("3", "spades"), c("3", "clubs"), c("5", "spades"), c("10", "diamonds")],
    [c("6", "spades"), c("7", "hearts"), c("Q", "clubs"), c("A", "spades")],
    [c("4", "hearts"), c("6", "diamonds"), c("J", "spades"), c("2", "clubs")],
  ];
}

test("opening leader is the player holding 3 of spades", () => {
  const state = createTrickState(deal(createDeck()));
  const holder = state.hands.findIndex((hand) =>
    hand.some((card) => card.id === "3-spades"),
  );
  assert.equal(state.currentPlayer, holder);
  assert.equal(state.leader, holder);
  assert.equal(state.openingLead, true);

  const scripted = createTrickState(scriptedHands());
  assert.equal(scripted.currentPlayer, 1);
});

test("opening lead must include 3 of spades", () => {
  const state = createTrickState(scriptedHands());
  assert.throws(() => playCards(state, 1, [c("5", "spades")]), /3 of spades/);
  assert.throws(
    () => playCards(state, 1, [c("3", "clubs")]),
    /3 of spades/,
  );
  // As a single, as a pair, and as part of a straight all work.
  playCards(state, 1, [c("3", "spades")]);
  assert.equal(state.openingLead, false);
  assert.equal(state.currentPlay.type, "single");

  const pairState = createTrickState(scriptedHands());
  playCards(pairState, 1, [c("3", "spades"), c("3", "clubs")]);
  assert.equal(pairState.currentPlay.type, "pair");
});

test("turns go clockwise after a play", () => {
  const state = createTrickState(scriptedHands());
  playCards(state, 1, [c("3", "spades")]);
  assert.equal(state.currentPlayer, 2);
  playCards(state, 2, [c("6", "spades")]); // beats 3 of spades
  assert.equal(state.currentPlayer, 3);
  playCards(state, 3, [c("J", "spades")]); // beats 6 of spades
  assert.equal(state.currentPlayer, 0);
});

test("a follow that does not beat is rejected", () => {
  const hands = [
    [c("9", "spades"), c("K", "clubs")],
    [c("3", "spades"), c("8", "hearts")],
    [c("5", "clubs"), c("Q", "spades")],
    [c("4", "diamonds"), c("J", "spades")],
  ];
  const state = createTrickState(hands);
  playCards(state, 1, [c("3", "spades")]); // turn -> 2
  playCards(state, 2, [c("5", "clubs")]); // beats 3; turn -> 3
  assert.throws(() => playCards(state, 3, [c("4", "diamonds")]), /does not beat/);
  // Wrong combination type also rejected: player 3 holds no pair, use player flow below
  playCards(state, 3, [c("J", "spades")]); // beats 5; turn -> 0
  assert.throws(() => playCards(state, 0, [c("9", "spades")]), /does not beat/);
  playCards(state, 0, [c("K", "clubs")]); // beats J
  assert.equal(state.currentPlay.player, 0);
});

test("playing out of turn or with cards not held is rejected", () => {
  const state = createTrickState(scriptedHands());
  assert.throws(() => playCards(state, 0, [c("4", "spades")]), /turn/);
  assert.throws(() => playCards(state, 1, [c("2", "hearts")]), /does not hold/);
});

test("the trick leader cannot pass", () => {
  const state = createTrickState(scriptedHands());
  assert.throws(() => passTurn(state, 1), /must play/);
});

test("passing locks a player out for the rest of the trick", () => {
  const state = createTrickState(scriptedHands());
  playCards(state, 1, [c("3", "spades")]); // -> 2
  passTurn(state, 2); // -> 3
  assert.deepEqual(state.passed, [2]);
  playCards(state, 3, [c("4", "hearts")]); // beats 3; -> 0 (2 skipped does not apply yet)
  assert.equal(state.currentPlayer, 0);
  playCards(state, 0, [c("8", "hearts")]); // beats 4; next clockwise is 1 (2 is locked out later)
  assert.equal(state.currentPlayer, 1);
  playCards(state, 1, [c("10", "diamonds")]); // beats 8; -> 3, skipping locked-out 2
  assert.equal(state.currentPlayer, 3);
  // Locked-out player 2 cannot jump back in.
  assert.throws(() => playCards(state, 2, [c("7", "hearts")]), /turn|locked out/);
  assert.throws(() => passTurn(state, 2), /turn|already passed/);
});

test("when all other players pass, the trick clears and the last player leads next", () => {
  const state = createTrickState(scriptedHands());
  playCards(state, 1, [c("3", "spades")]); // -> 2
  playCards(state, 2, [c("6", "spades")]); // beats 3 -> 3
  passTurn(state, 3); // -> 0
  passTurn(state, 0); // -> 1
  assert.notEqual(state.currentPlay, null); // not cleared yet: player 1 can still act
  passTurn(state, 1); // all others passed -> clear
  assert.equal(state.currentPlay, null);
  assert.deepEqual(state.passed, []);
  assert.equal(state.leader, 2);
  assert.equal(state.currentPlayer, 2); // winner leads next
  assert.equal(state.trickNumber, 2);
  // The next leader may lead any legal combination — no 3 of spades rule,
  // no need to match the cleared trick.
  playCards(state, 2, [c("7", "hearts")]);
  assert.equal(state.currentPlay.type, "single");
});

test("next leader can lead a different type than the cleared trick", () => {
  const hands = [
    [c("4", "spades"), c("4", "clubs"), c("9", "spades")],
    [c("3", "spades"), c("8", "spades"), c("8", "clubs")],
    [c("5", "spades"), c("10", "spades")],
    [c("6", "spades"), c("J", "spades")],
  ];
  const state = createTrickState(hands);
  playCards(state, 1, [c("3", "spades")]); // -> 2
  passTurn(state, 2);
  passTurn(state, 3);
  passTurn(state, 0); // clear, leader 1 again
  assert.equal(state.currentPlayer, 1);
  playCards(state, 1, [c("8", "spades"), c("8", "clubs")]); // pair lead is fine
  assert.equal(state.currentPlay.type, "pair");
});
