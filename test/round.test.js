import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { createMatch, finishRound } from "../src/engine/match.js";

const c = makeCard;

test("a round plays all the way down: finish order recorded, last place holds the leftovers", () => {
  const state = createTrickState([
    [c("3", "spades"), c("K", "spades")],
    [c("4", "spades"), c("Q", "spades")],
    [c("5", "spades"), c("J", "spades")],
    [c("6", "spades"), c("10", "spades"), c("2", "diamonds")],
  ]);

  // Trick 1: singles climb around the table.
  playCards(state, 0, [c("3", "spades")]);
  playCards(state, 1, [c("4", "spades")]);
  playCards(state, 2, [c("5", "spades")]);
  playCards(state, 3, [c("6", "spades")]);
  playCards(state, 0, [c("K", "spades")]); // player 0 sheds out -> 1st
  assert.deepEqual(state.finishOrder, [0]);
  assert.equal(state.roundOver, false);
  passTurn(state, 1);
  passTurn(state, 2);
  passTurn(state, 3); // trick clears; lead passes clockwise past empty player 0
  assert.equal(state.currentPlayer, 1);

  // Trick 2: player 1 sheds out -> 2nd.
  playCards(state, 1, [c("Q", "spades")]);
  assert.deepEqual(state.finishOrder, [0, 1]);
  passTurn(state, 2);
  passTurn(state, 3);
  assert.equal(state.currentPlayer, 2);

  // Trick 3: player 2 sheds out -> 3rd. Only player 3 still holds
  // cards, so the round ends on the spot and player 3 is last.
  playCards(state, 2, [c("J", "spades")]);
  assert.equal(state.roundOver, true);
  assert.deepEqual(state.finishOrder, [0, 1, 2, 3]);
  assert.deepEqual(
    state.hands[3].map((card) => card.id).sort(),
    ["10-spades", "2-diamonds"],
  );
  assert.throws(() => playCards(state, 3, [c("10", "spades")]), /round is over/);
  assert.throws(() => passTurn(state, 3), /round is over/);

  // Scoring the finished round: baseline [2, 1, -1, -2] plus player 3's
  // leftover 2 costs 1 more, paid to 1st (player 0).
  const match = createMatch();
  const result = finishRound(match, state);
  assert.deepEqual(result.deltas, [3, 1, -1, -3]);
  assert.deepEqual(result.penalties, [{ player: 3, points: 1, paidTo: 0 }]);
  assert.deepEqual(result.scores, [3, 1, -1, -3]);
  assert.equal(result.nextLeader, 0);
  assert.equal(result.matchWinner, null);
});
