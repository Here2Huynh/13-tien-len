import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, makeCard } from "../src/engine/cards.js";
import {
  createMatch,
  startRound,
  applyInstantWin,
  finishRound,
  MATCH_TARGET,
} from "../src/engine/match.js";

const c = makeCard;
const finishedState = (finishOrder, lastHand = []) => ({
  roundOver: true,
  finishOrder,
  hands: [0, 1, 2, 3].map((p) => (p === finishOrder[3] ? lastHand : [])),
});

test("match starts empty, target is 13", () => {
  const match = createMatch();
  assert.deepEqual(match.scores, [0, 0, 0, 0]);
  assert.equal(match.roundNumber, 1);
  assert.equal(match.winner, null);
  assert.equal(MATCH_TARGET, 13);
});

test("scores accumulate across rounds; round winner leads next", () => {
  const match = createMatch();
  finishRound(match, finishedState([0, 1, 2, 3]));
  assert.deepEqual(match.scores, [2, 1, -1, -2]);
  assert.equal(match.leader, 0);
  finishRound(match, finishedState([3, 1, 2, 0]));
  assert.deepEqual(match.scores, [0, 2, -2, 0]);
  assert.equal(match.leader, 3);
  assert.equal(match.roundNumber, 3);
  assert.equal(match.winner, null);
});

test("first to reach 13 at the end of a round wins the match", () => {
  const match = createMatch();
  match.scores = [11, 0, 0, 0];
  const result = finishRound(match, finishedState([0, 1, 2, 3]));
  assert.deepEqual(result.scores, [13, 1, -1, -2]);
  assert.equal(result.matchWinner, 0);
  assert.throws(() => finishRound(match, finishedState([0, 1, 2, 3])), /match is over/);
});

test("several players cross 13 in one round: highest score wins", () => {
  const match = createMatch();
  match.scores = [12, 12, 0, 0];
  // Player 1 finishes 1st (+2 -> 14), player 0 finishes 2nd (+1 -> 13).
  const result = finishRound(match, finishedState([1, 0, 2, 3]));
  assert.deepEqual(result.scores, [13, 14, -1, -2]);
  assert.equal(result.matchWinner, 1);
});

test("exact tie at the top: the tied player who finished higher wins", () => {
  const match = createMatch();
  match.scores = [11, 12, 0, 0];
  // Player 0 finishes 1st (+2 -> 13), player 1 finishes 2nd (+1 -> 13).
  // Flagged tiebreak: player 0 wins, having finished 1st in the round.
  const result = finishRound(match, finishedState([0, 1, 2, 3]));
  assert.deepEqual(result.scores, [13, 13, -1, -2]);
  assert.equal(result.matchWinner, 0);
});

test("instant win at deal: round ends immediately, payout with no penalties", () => {
  const dragon = [
    c("3", "spades"), c("4", "clubs"), c("5", "diamonds"), c("6", "hearts"),
    c("7", "spades"), c("8", "clubs"), c("9", "diamonds"), c("10", "hearts"),
    c("J", "spades"), c("Q", "clubs"), c("K", "diamonds"), c("A", "hearts"),
    c("3", "clubs"),
  ];
  const dragonIds = new Set(dragon.map((card) => card.id));
  const rest = createDeck().filter((card) => !dragonIds.has(card.id));
  const hands = [
    rest.slice(0, 13),
    dragon,
    rest.slice(13, 26),
    rest.slice(26, 39),
  ];
  // The other hands hold all four 2s between them — leftovers that must
  // NOT be charged, because an instant win ends the round at deal.
  const match = createMatch();
  const start = startRound(match, hands);
  assert.deepEqual(start, { type: "instant-win", winner: 1, kind: "dragon-straight" });
  const result = applyInstantWin(match, start.winner);
  assert.deepEqual(result.deltas, [-2, 6, -2, -2]);
  assert.deepEqual(result.scores, [-2, 6, -2, -2]);
  assert.equal(match.leader, 1); // instant winner leads the next round
  assert.equal(match.roundNumber, 2);
});

test("round 2+: previous winner leads, no 3-of-spades opening rule", () => {
  const match = createMatch();
  match.roundNumber = 2;
  match.leader = 1;
  const hands = [
    [c("3", "spades"), c("9", "clubs"), c("10", "clubs")],
    [c("5", "spades"), c("9", "diamonds"), c("10", "diamonds")],
    [c("6", "spades"), c("9", "hearts"), c("10", "hearts")],
    [c("7", "spades"), c("8", "clubs"), c("J", "clubs")],
  ];
  const start = startRound(match, hands);
  assert.equal(start.type, "play");
  assert.equal(start.state.currentPlayer, 1); // previous winner, not the 3-of-spades holder
  assert.equal(start.state.openingLead, false);
});

test("round 1 still opens with the 3-of-spades holder", () => {
  const match = createMatch();
  const hands = [
    [c("4", "spades")],
    [c("5", "spades")],
    [c("3", "spades")],
    [c("6", "spades")],
  ];
  const start = startRound(match, hands);
  assert.equal(start.type, "play");
  assert.equal(start.state.currentPlayer, 2);
  assert.equal(start.state.openingLead, true);
});
