import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import {
  createTrickState,
  playCards,
  passTurn,
  hasComebackTurn,
} from "../src/engine/trick.js";

const c = makeCard;

test("a bomb beats a single 2 as a normal follow", () => {
  const bomb = [
    c("3", "clubs"), c("3", "diamonds"),
    c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const state = createTrickState([
    [c("3", "spades"), c("9", "clubs")],
    [c("2", "spades"), c("10", "clubs")],
    [...bomb, c("8", "spades")],
    [c("6", "clubs"), c("J", "diamonds")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  playCards(state, 1, [c("2", "spades")]); // single 2
  playCards(state, 2, bomb); // 3-pair double run bombs it
  assert.equal(state.currentPlay.player, 2);
  assert.equal(state.currentPlay.type, "bomb");
  // A plain card cannot answer a bomb.
  assert.throws(() => playCards(state, 3, [c("J", "diamonds")]), /does not beat/);
  passTurn(state, 3);
  passTurn(state, 0);
  passTurn(state, 1); // trick clears to the bomber
  assert.equal(state.currentPlay, null);
  assert.equal(state.currentPlayer, 2);
});

test("pair of 2s: 3-pair run rejected, 4-pair run bombs it", () => {
  const run3 = [
    c("3", "clubs"), c("3", "diamonds"),
    c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const run4 = [
    c("4", "clubs"), c("4", "hearts"),
    c("5", "spades"), c("5", "hearts"),
    c("6", "clubs"), c("6", "diamonds"),
    c("7", "clubs"), c("7", "diamonds"),
  ];
  const state = createTrickState([
    [c("3", "spades"), c("3", "hearts"), c("9", "spades")],
    [c("2", "spades"), c("2", "hearts"), c("K", "clubs")],
    [...run3, c("8", "diamonds")],
    [...run4, c("10", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades"), c("3", "hearts")]); // pair incl. 3 of spades
  playCards(state, 1, [c("2", "spades"), c("2", "hearts")]); // pair of 2s
  assert.throws(() => playCards(state, 2, run3), /does not beat/);
  passTurn(state, 2);
  playCards(state, 3, run4); // 4-pair double run bombs the pair of 2s
  assert.equal(state.currentPlay.player, 3);
});

test("comeback: four of a kind accepted on the passed player's own turn", () => {
  const four7s = [c("7", "spades"), c("7", "clubs"), c("7", "diamonds"), c("7", "hearts")];
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("9", "diamonds")],
    [...four7s, c("8", "clubs")],
    [c("2", "hearts"), c("K", "spades"), c("5", "diamonds")],
    [c("6", "diamonds"), c("Q", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1); // player 1 passes BEFORE the 2 is played
  playCards(state, 2, [c("2", "hearts")]);
  // Out of turn: player 1 cannot slam the bomb while it is player 3's turn.
  assert.throws(() => playCards(state, 1, four7s), /turn/);
  passTurn(state, 3);
  passTurn(state, 0);
  // Now it is player 1's comeback turn, in order.
  assert.equal(state.currentPlayer, 1);
  assert.equal(hasComebackTurn(state, 1), true);
  playCards(state, 1, four7s);
  assert.equal(state.currentPlay.player, 1);
  assert.equal(state.passed.includes(1), false); // back in the trick
  passTurn(state, 2); // everyone else is out -> clears to player 1
  assert.equal(state.currentPlay, null);
  assert.equal(state.currentPlayer, 1);
  playCards(state, 1, [c("8", "clubs")]); // winner leads the next trick
});

test("comeback: 4-pair double run accepted after passing", () => {
  const run4 = [
    c("3", "clubs"), c("3", "hearts"),
    c("4", "diamonds"), c("4", "hearts"),
    c("5", "clubs"), c("5", "diamonds"),
    c("6", "clubs"), c("6", "diamonds"),
  ];
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("9", "diamonds")],
    [...run4, c("8", "clubs")],
    [c("2", "hearts"), c("K", "spades")],
    [c("6", "hearts"), c("Q", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1);
  playCards(state, 2, [c("2", "hearts")]);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1);
  playCards(state, 1, run4);
  assert.equal(state.currentPlay.player, 1);
  assert.equal(state.currentPlay.type, "bomb");
});

test("comeback: 3-pair double run is rejected after passing", () => {
  const run3 = [
    c("3", "clubs"), c("3", "hearts"),
    c("4", "diamonds"), c("4", "hearts"),
    c("5", "clubs"), c("5", "diamonds"),
  ];
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs")],
    [...run3, c("8", "clubs")],
    [c("2", "hearts"), c("K", "spades")],
    [c("6", "diamonds"), c("Q", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1);
  playCards(state, 2, [c("2", "hearts")]);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1); // comeback turn arrives in order
  assert.throws(() => playCards(state, 1, run3), /Comeback/);
  // Declining the comeback spends it; the trick then clears to player 2.
  passTurn(state, 1);
  assert.equal(state.currentPlay, null);
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.leader, 2);
});

test("no comeback against a led 2: players who pass on it are just out", () => {
  const state = createTrickState([
    [c("3", "spades"), c("9", "clubs")],
    [c("2", "hearts"), c("K", "spades"), c("5", "diamonds")],
    [c("6", "diamonds"), c("Q", "spades")],
    [c("6", "clubs"), c("J", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  playCards(state, 1, [c("2", "hearts")]); // the 2 is played before anyone passed
  passTurn(state, 2);
  passTurn(state, 3);
  passTurn(state, 0); // clears normally — nobody was a comeback candidate
  assert.equal(state.currentPlay, null);
  assert.equal(state.currentPlayer, 1);
});

test("triple 2s cannot be bombed in the trick flow", () => {
  const state = createTrickState([
    [c("3", "spades"), c("3", "clubs"), c("3", "diamonds"), c("9", "spades")],
    [c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("K", "clubs")],
    [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts"), c("5", "spades")],
    [c("6", "clubs"), c("J", "diamonds")],
  ]);
  playCards(state, 0, [c("3", "spades"), c("3", "clubs"), c("3", "diamonds")]); // triple incl. 3 of spades
  playCards(state, 1, [c("2", "spades"), c("2", "clubs"), c("2", "diamonds")]); // triple 2s
  assert.throws(
    () =>
      playCards(state, 2, [
        c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts"),
      ]),
    /does not beat/,
  );
});

test("a bomb cannot be led", () => {
  const run3 = [
    c("3", "spades"), c("3", "clubs"),
    c("4", "spades"), c("4", "clubs"),
    c("5", "spades"), c("5", "clubs"),
  ];
  const state = createTrickState([
    [...run3, c("9", "spades")],
    [c("6", "clubs")],
    [c("7", "clubs")],
    [c("8", "clubs")],
  ]);
  assert.throws(() => playCards(state, 0, run3), /cannot be led/);
});
