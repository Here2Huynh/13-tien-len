import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck, makeCard, sortCards, type Card, type Rank, type Suit,
} from "../src/engine/cards.js";
import { shuffle, deal } from "../src/engine/deal.js";
import { detectCombination } from "../src/engine/combinations.js";
import { beats } from "../src/engine/plays.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { detectBomb, bombBeats, isComebackBomb } from "../src/engine/bombs.js";
import { detectInstantWin } from "../src/engine/instantWin.js";
import { scoreRound, scoreInstantWin, leftoverPenalty, countUnusedBombs, unusedBombs } from "../src/engine/scoring.js";
import { createMatch, startRound, applyInstantWin, finishRound, applyChop } from "../src/engine/match.js";
import { seededRng } from "../src/engine/runner.js";

// Consolidated engine suite: cards, deal, combinations, plays, trick
// flow, bombs, instant wins, scoring, match. One file by design —
// the detailed per-module suites were merged here.

const c = makeCard;

// ---------- cards & deal ----------

test("deck: 52 unique cards, 3 of spades lowest, 2 of hearts highest", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
  const sorted = sortCards(deck);
  assert.equal(sorted[0].id, "3-spades");
  assert.equal(sorted[51].id, "2-hearts");
});

test("deal: 4 hands of 13 covering the deck; seeded shuffle is deterministic", () => {
  const hands = deal(createDeck());
  assert.deepEqual(hands.map((h) => h.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map((card) => card.id)).size, 52);
  const a = shuffle(createDeck(), seededRng(9)).map((card) => card.id);
  const b = shuffle(createDeck(), seededRng(9)).map((card) => card.id);
  assert.deepEqual(a, b);
});

// ---------- combinations & plays ----------

test("combinations: sets detected; straights reject 2s; pair sequences are not combinations", () => {
  assert.equal(detectCombination([c("9", "spades")])?.type, "single");
  assert.equal(detectCombination([c("9", "spades"), c("9", "hearts")])?.type, "pair");
  assert.equal(detectCombination([c("9", "spades"), c("9", "clubs"), c("9", "hearts")])?.type, "triple");
  assert.equal(
    detectCombination([c("3", "spades"), c("4", "clubs"), c("5", "diamonds")])?.type,
    "straight",
  );
  assert.equal(detectCombination([c("Q", "spades"), c("K", "clubs"), c("A", "diamonds"), c("2", "hearts")]), null);
  assert.equal(
    detectCombination([
      c("3", "spades"), c("3", "hearts"), c("4", "spades"),
      c("4", "hearts"), c("5", "spades"), c("5", "hearts"),
    ]),
    null,
  );
  assert.equal(detectCombination([c("9", "spades"), c("10", "hearts")]), null);
});

test("plays: same type compares by highest card (rank, then suit); different types never beat", () => {
  assert.equal(beats([c("7", "hearts")], [c("7", "spades")]), true);
  assert.equal(beats([c("7", "spades")], [c("7", "hearts")]), false);
  assert.equal(beats([c("8", "spades"), c("8", "clubs")], [c("7", "spades"), c("7", "hearts")]), true);
  assert.equal(beats([c("2", "hearts")], [c("3", "spades"), c("3", "hearts")]), false);
});

test("plays: a legal play must match the card count — a 4-card straight never beats a 3-card straight", () => {
  const three = [c("3", "spades"), c("4", "clubs"), c("5", "diamonds")];
  const four = [c("3", "spades"), c("4", "clubs"), c("5", "diamonds"), c("6", "hearts")];
  assert.equal(beats(four, three), false);
  assert.equal(beats(three, four), false);
});

test("plays: equal plays do not beat", () => {
  assert.equal(beats([c("7", "hearts")], [c("7", "hearts")]), false);
  assert.equal(
    beats([c("9", "spades"), c("9", "hearts")], [c("9", "spades"), c("9", "hearts")]),
    false,
  );
});

test("plays: straights compare by highest card, suit included", () => {
  const lowStraight = [c("3", "spades"), c("4", "clubs"), c("5", "diamonds")];
  const highStraight = [c("4", "spades"), c("5", "clubs"), c("6", "diamonds")];
  assert.equal(beats(highStraight, lowStraight), true);
  assert.equal(beats(lowStraight, highStraight), false);
  // Same ranks: the straight whose top card has the higher suit wins.
  const heartsTop = [c("3", "clubs"), c("4", "diamonds"), c("5", "hearts")];
  const spadesTop = [c("3", "diamonds"), c("4", "clubs"), c("5", "spades")];
  assert.equal(beats(heartsTop, spadesTop), true);
  assert.equal(beats(spadesTop, heartsTop), false);
});

// ---------- trick flow ----------

test("trick: the 3-of-spades holder leads round 1, and the opening lead must include it", () => {
  const state = createTrickState([
    [c("5", "spades"), c("9", "clubs")],
    [c("3", "spades"), c("9", "diamonds")],
    [c("6", "spades"), c("10", "clubs")],
    [c("7", "spades"), c("J", "clubs")],
  ]);
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.openingLead, true);
  assert.throws(() => playCards(state, 1, [c("9", "diamonds")]), /3 of spades/);
  playCards(state, 1, [c("3", "spades")]);
  assert.equal(state.currentPlayer, 2);
});

test("trick: out-of-turn and unheld cards are rejected; the leader cannot pass", () => {
  const state = createTrickState(
    [
      [c("3", "spades"), c("9", "clubs")],
      [c("4", "spades"), c("9", "diamonds")],
      [c("6", "spades"), c("10", "clubs")],
      [c("7", "spades"), c("J", "clubs")],
    ],
    { leader: 0, openingLead: false },
  );
  assert.throws(() => playCards(state, 1, [c("4", "spades")]), /turn/);
  assert.throws(() => playCards(state, 0, [c("A", "hearts")]), /does not hold/);
  assert.throws(() => passTurn(state, 0), /must play, not pass/);
});

test("trick: passing locks a player out for the rest of the trick", () => {
  const state = createTrickState(
    [
      [c("3", "spades"), c("9", "clubs"), c("K", "clubs")],
      [c("5", "spades"), c("9", "diamonds")],
      [c("6", "spades"), c("10", "clubs")],
      [c("7", "spades"), c("J", "clubs")],
    ],
    { leader: 0, openingLead: false },
  );
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1);
  playCards(state, 2, [c("6", "spades")]);
  playCards(state, 3, [c("J", "clubs")]);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 2); // player 1 is skipped: locked out
  passTurn(state, 2);
  assert.equal(state.trickNumber, 2);
  assert.equal(state.currentPlayer, 3); // trick winner leads
  assert.equal(state.currentPlay, null);
});

test("trick: rounds play to last place, then the round is over", () => {
  const state = createTrickState(
    [
      [c("9", "clubs"), c("K", "clubs")],
      [c("9", "diamonds"), c("5", "spades")],
      [c("10", "clubs"), c("6", "spades")],
      [c("J", "clubs"), c("7", "spades")],
    ],
    { leader: 0, openingLead: false },
  );
  playCards(state, 0, [c("9", "clubs")]);
  playCards(state, 1, [c("9", "diamonds")]);
  playCards(state, 2, [c("10", "clubs")]);
  playCards(state, 3, [c("J", "clubs")]);
  passTurn(state, 0);
  passTurn(state, 1);
  passTurn(state, 2); // trick clears to player 3
  playCards(state, 3, [c("7", "spades")]); // player 3 goes out first
  playCards(state, 0, [c("K", "clubs")]); // player 0 goes out second
  passTurn(state, 1);
  passTurn(state, 2); // trick clears; player 1 leads the last trick
  playCards(state, 1, [c("5", "spades")]); // player 1 goes out third
  assert.equal(state.roundOver, true);
  assert.deepEqual(state.finishOrder, [3, 0, 1, 2]);
  assert.throws(() => passTurn(state, 2), /round is over/);
});

// ---------- bombs ----------

const seq3 = () => [
  c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"),
  c("4", "diamonds"), c("5", "clubs"), c("5", "diamonds"),
];
const seq4 = () => [...seq3(), c("6", "clubs"), c("6", "diamonds")];
const quad8 = () => [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];

test("bombs: detection kinds, and 5+ pair sequences are not bombs", () => {
  assert.equal(detectBomb(seq3())?.kind, "pair-sequence-3");
  assert.equal(detectBomb(seq4())?.kind, "pair-sequence-4");
  assert.equal(detectBomb(quad8())?.kind, "four-of-a-kind");
  const seq5 = [...seq4(), c("7", "clubs"), c("7", "diamonds")];
  assert.equal(detectBomb(seq5), null);
  assert.equal(detectBomb([c("9", "spades"), c("9", "hearts")]), null);
});

test("bombs: the ladder — what bombs what; triple 2s are unbeatable", () => {
  const single2 = [c("2", "diamonds")];
  const pair2 = [c("2", "spades"), c("2", "hearts")];
  const triple2 = [c("2", "spades"), c("2", "clubs"), c("2", "hearts")];
  assert.equal(bombBeats(seq3(), single2), true);
  assert.equal(bombBeats(seq3(), pair2), false);
  assert.equal(bombBeats(seq4(), pair2), true);
  assert.equal(bombBeats(quad8(), single2), true);
  assert.equal(bombBeats(quad8(), pair2), true);
  assert.equal(bombBeats(seq4(), triple2), false);
  assert.equal(bombBeats(quad8(), triple2), false);
});

test("bombs: comeback-legal kinds are four of a kind and the 4-pair run only", () => {
  assert.equal(isComebackBomb(quad8()), true);
  assert.equal(isComebackBomb(seq4()), true);
  assert.equal(isComebackBomb(seq3()), false);
});

test("trick bombs: a bomb answers a single 2 as a normal follow", () => {
  const state = createTrickState(
    [
      [c("3", "spades"), c("Q", "diamonds")],
      [c("2", "hearts"), c("K", "spades")],
      [...seq3(), c("9", "clubs")],
      [c("6", "diamonds"), c("J", "spades")],
    ],
    { leader: 0, openingLead: false },
  );
  playCards(state, 0, [c("3", "spades")]);
  playCards(state, 1, [c("2", "hearts")]);
  playCards(state, 2, seq3());
  assert.equal(state.currentPlay?.type, "bomb");
  assert.equal(state.lastPlayer, 2);
});

test("trick bombs: comeback — four of a kind works after passing, the 3-pair run does not", () => {
  const build = (p1Hand: Card[]) =>
    createTrickState(
      [
        [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
        p1Hand,
        [c("2", "hearts"), c("K", "spades")],
        [c("6", "diamonds"), c("J", "spades")],
      ],
      { leader: 0, openingLead: false },
    );
  const quad9 = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const withQuad = build([...seq3(), ...quad9]);
  playCards(withQuad, 0, [c("3", "spades")]);
  passTurn(withQuad, 1);
  playCards(withQuad, 2, [c("2", "hearts")]);
  passTurn(withQuad, 3);
  passTurn(withQuad, 0);
  playCards(withQuad, 1, quad9); // comeback bomb accepted
  assert.equal(withQuad.currentPlay?.type, "four-of-a-kind");

  const runOnly = build([...seq3(), c("8", "clubs")]);
  playCards(runOnly, 0, [c("3", "spades")]);
  passTurn(runOnly, 1);
  playCards(runOnly, 2, [c("2", "hearts")]);
  passTurn(runOnly, 3);
  passTurn(runOnly, 0);
  assert.throws(() => playCards(runOnly, 1, seq3()), /comeback/i);
});

// ---------- instant wins ----------

test("instant wins: all five kinds are detected on a 13-card hand", () => {
  const four2s = [
    c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts"),
    c("3", "spades"), c("5", "clubs"), c("7", "diamonds"), c("9", "spades"),
    c("J", "clubs"), c("K", "diamonds"), c("A", "spades"), c("4", "hearts"), c("6", "hearts"),
  ];
  assert.equal(detectInstantWin(four2s)?.kind, "four-2s");
  const dragon = [
    c("3", "spades"), c("4", "clubs"), c("5", "diamonds"), c("6", "hearts"),
    c("7", "spades"), c("8", "clubs"), c("9", "diamonds"), c("10", "hearts"),
    c("J", "spades"), c("Q", "clubs"), c("K", "diamonds"), c("A", "hearts"), c("3", "hearts"),
  ];
  assert.equal(detectInstantWin(dragon)?.kind, "dragon-straight");
  const triples = [
    c("5", "spades"), c("5", "clubs"), c("5", "diamonds"),
    c("6", "spades"), c("6", "clubs"), c("6", "diamonds"),
    c("7", "spades"), c("7", "clubs"), c("7", "diamonds"),
    c("9", "spades"), c("J", "clubs"), c("K", "diamonds"), c("3", "hearts"),
  ];
  assert.equal(detectInstantWin(triples)?.kind, "three-consecutive-triples");
  const fivePairs = [
    c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"), c("6", "clubs"), c("6", "diamonds"),
    c("7", "clubs"), c("7", "diamonds"),
    c("9", "spades"), c("J", "clubs"), c("K", "diamonds"),
  ];
  assert.equal(detectInstantWin(fivePairs)?.kind, "five-consecutive-pairs");
  const sixPairs = [
    c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"), c("6", "clubs"), c("6", "diamonds"),
    c("8", "clubs"), c("8", "diamonds"), c("9", "clubs"), c("9", "diamonds"),
    c("K", "diamonds"),
  ];
  assert.equal(detectInstantWin(sixPairs)?.kind, "six-pairs");
});

test("instant wins: near misses do not count", () => {
  const scatteredPairs = [
    c("3", "clubs"), c("3", "diamonds"), c("5", "clubs"), c("5", "diamonds"),
    c("7", "clubs"), c("7", "diamonds"), c("9", "clubs"), c("9", "diamonds"),
    c("J", "clubs"), c("J", "diamonds"),
    c("4", "spades"), c("6", "hearts"), c("K", "diamonds"),
  ];
  assert.equal(detectInstantWin(scatteredPairs), null); // five pairs, not consecutive
  assert.equal(detectInstantWin(scatteredPairs.slice(0, 12)), null); // not 13 cards
});

// ---------- scoring & match ----------

test("scoring: baseline by place is zero-sum (1st +2, 2nd +1, 3rd -1, last -2)", () => {
  const { deltas } = scoreRound([2, 0, 3, 1], [[], [], [], []]);
  assert.deepEqual(deltas, [1, -2, 2, -1]);
  assert.equal(deltas.reduce((a, b) => a + b, 0), 0);
});

test("scoring: leftover 2s and unused bombs penalize, paid to the player above (last pays 1st)", () => {
  assert.deepEqual(leftoverPenalty([c("2", "spades"), ...quad8()]), {
    twos: 1, bombs: 1, points: 2,
  });
  // Four 3s (a quad) plus pairs of 4/5/6: disjoint count is quad + 3-pair run.
  assert.equal(countUnusedBombs([...seq4(), c("3", "spades"), c("3", "hearts")]), 2);
  const { deltas, penalties } = scoreRound(
    [0, 1, 2, 3],
    [[], [], [], [c("2", "spades"), c("9", "clubs")]],
  );
  assert.deepEqual(penalties, [
    { player: 3, points: 1, paidTo: 0, twos: [c("2", "spades")], bombs: [] },
  ]);
  assert.deepEqual(deltas, [3, 1, -1, -3]);
});

test("scoring: an instant win pays the winner 6, everyone else -2, no penalties", () => {
  const { deltas, penalties } = scoreInstantWin(1);
  assert.deepEqual(deltas, [-2, 6, -2, -2]);
  assert.deepEqual(penalties, []);
});

test("match: instant win at the deal ends the round before any play", () => {
  const match = createMatch();
  const sixPairs = [
    c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"), c("6", "clubs"), c("6", "diamonds"),
    c("9", "clubs"), c("9", "diamonds"), c("10", "clubs"), c("10", "diamonds"),
    c("K", "spades"),
  ];
  const sixIds = new Set(sixPairs.map((card) => card.id));
  const rest = shuffle(
    createDeck().filter((card) => !sixIds.has(card.id)),
    seededRng(3),
  );
  const hands: Card[][] = [[], [], sixPairs, []];
  rest.forEach((card, i) => hands[[0, 1, 3][i % 3]].push(card));
  assert.equal(detectInstantWin(hands[0]), null);
  assert.equal(detectInstantWin(hands[1]), null);
  assert.equal(detectInstantWin(hands[3]), null);
  const start = startRound(match, hands);
  assert.equal(start.type, "instant-win");
  if (start.type !== "instant-win") assert.fail("expected an instant-win start");
  assert.equal(start.winner, 2);
  assert.equal(start.kind, "six-pairs");
});

function finishedState(finishOrder: number[], lastHand: Card[] = [c("9", "clubs")]) {
  const state = createTrickState([[], [], [], []], { leader: 0, openingLead: false });
  state.hands[finishOrder[3]] = lastHand; // last place still holds cards
  state.finishOrder = [...finishOrder];
  state.roundOver = true;
  return state;
}

test("match: an exact tie at 13+ goes to the higher finisher in the final round", () => {
  const match = createMatch();
  match.scores = [11, 12, 0, 0];
  const result = finishRound(match, finishedState([0, 1, 2, 3]));
  // Deltas +2/+1/-1/-2 put both player 0 and player 1 on exactly 13.
  assert.deepEqual(result.scores, [13, 13, -1, -2]);
  assert.equal(result.matchWinner, 0); // player 0 finished higher
});

test("match: when several players cross 13 in one round, the highest score wins", () => {
  const match = createMatch();
  match.scores = [12, 12, 0, 0];
  const result = finishRound(match, finishedState([1, 0, 2, 3]));
  // Player 1 takes +2 to 14, player 0 takes +1 to 13: no tiebreak needed.
  assert.deepEqual(result.scores, [13, 14, -1, -2]);
  assert.equal(result.matchWinner, 1);
});

test("match: scores accumulate across rounds; first to 13 wins; the winner leads next", () => {
  const match = createMatch();
  applyInstantWin(match, 2);
  assert.deepEqual(match.scores, [-2, -2, 6, -2]);
  assert.equal(match.leader, 2);
  assert.equal(match.roundNumber, 2);
  assert.equal(match.winner, null);
  applyInstantWin(match, 2);
  assert.equal(match.scores[2], 12);
  assert.equal(match.winner, null);
  applyInstantWin(match, 2);
  assert.equal(match.scores[2], 18);
  assert.equal(match.winner, 2);
});

// ---------- chop (TASK 012) ----------

const quad = (rank: Rank): Card[] =>
  (["spades", "clubs", "diamonds", "hearts"] as Suit[]).map((s) => c(rank, s));

test("chop: a single 2 is chopped by every bomb tier, 1 point, instantly", () => {
  for (const bomb of [seq3(), seq4(), quad("9")]) {
    const match = createMatch();
    const chop = applyChop(match, { player: 1, cards: [c("2", "hearts")] }, bomb, 2);
    assert.deepEqual(chop, { payer: 1, payee: 2, points: 1 });
    // The scores moved immediately — no round end involved.
    assert.deepEqual(match.scores, [0, -1, 1, 0]);
  }
});

test("chop: a pair of 2s pays 2 to the 4-pair run and to four of a kind; the 3-pair run cannot chop it", () => {
  const pair2 = { player: 0, cards: [c("2", "clubs"), c("2", "diamonds")] };
  for (const bomb of [seq4(), quad("9")]) {
    const match = createMatch();
    assert.deepEqual(applyChop(match, pair2, bomb, 3), { payer: 0, payee: 3, points: 2 });
    assert.deepEqual(match.scores, [-2, 0, 0, 2]);
  }
  const match = createMatch();
  assert.equal(applyChop(match, pair2, seq3(), 3), null);
  assert.deepEqual(match.scores, [0, 0, 0, 0]);
});

test("chop: no bombed 2, no chop — higher 2 over 2, higher quad over quad, a bomb led, a bomb over a non-2, triple 2s", () => {
  const cases: [{ player: number; cards: Card[] } | null, Card[]][] = [
    [{ player: 0, cards: [c("2", "clubs")] }, [c("2", "hearts")]],
    [{ player: 0, cards: quad("5") }, quad("9")],
    [null, seq3()],
    [{ player: 0, cards: [c("K", "clubs"), c("K", "diamonds")] }, quad("9")],
    [{ player: 0, cards: [c("2", "clubs"), c("2", "diamonds"), c("2", "hearts")] }, quad("9")],
  ];
  for (const [prevPlay, cards] of cases) {
    const match = createMatch();
    assert.equal(applyChop(match, prevPlay, cards, 1), null);
    assert.deepEqual(match.scores, [0, 0, 0, 0]);
  }
});

test("chop: a comeback bomb chops too", () => {
  const match = createMatch();
  const quad9 = quad("9");
  const state = createTrickState(
    [
      [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
      [...seq3(), ...quad9],
      [c("2", "hearts"), c("K", "spades")],
      [c("6", "diamonds"), c("J", "spades")],
    ],
    { leader: 0, openingLead: false },
  );
  // Play the way the controller and runner do: capture the current
  // play, apply the play, then settle any chop.
  const play = (player: number, cards: Card[]) => {
    const prevPlay = state.currentPlay;
    playCards(state, player, cards);
    return applyChop(match, prevPlay, cards, player);
  };
  assert.equal(play(0, [c("3", "spades")]), null);
  passTurn(state, 1); // player 1 passes, holding the quad
  assert.equal(play(2, [c("2", "hearts")]), null);
  passTurn(state, 3);
  passTurn(state, 0);
  // The comeback bomb lands on the 2: player 2 pays player 1, now.
  assert.deepEqual(play(1, quad9), { payer: 2, payee: 1, points: 1 });
  assert.deepEqual(match.scores, [0, 1, -1, 0]);
  assert.equal(state.roundOver, false); // mid-round, exactly as ruled
});

test("chop: the chopped 2 is never charged again as a round-end leftover", () => {
  const match = createMatch();
  const state = createTrickState(
    [
      [c("3", "spades"), c("Q", "diamonds")],
      [c("2", "hearts"), c("K", "spades")],
      [...seq3(), c("9", "clubs")],
      [c("6", "diamonds"), c("J", "spades")],
    ],
    { leader: 0, openingLead: false },
  );
  const play = (player: number, cards: Card[]) => {
    const prevPlay = state.currentPlay;
    playCards(state, player, cards);
    return applyChop(match, prevPlay, cards, player);
  };
  assert.equal(play(0, [c("3", "spades")]), null);
  assert.equal(play(1, [c("2", "hearts")]), null);
  assert.deepEqual(play(2, seq3()), { payer: 1, payee: 2, points: 1 });
  assert.deepEqual(match.scores, [0, -1, 1, 0]); // instant, mid-round
  passTurn(state, 3);
  passTurn(state, 0);
  passTurn(state, 1); // the bomb stands; the trick clears to player 2
  assert.equal(play(2, [c("9", "clubs")]), null); // player 2 goes out leading
  passTurn(state, 3);
  assert.equal(play(0, [c("Q", "diamonds")]), null); // player 0 out
  assert.equal(play(1, [c("K", "spades")]), null); // player 1 out; round over
  assert.equal(state.roundOver, true);
  assert.deepEqual(state.finishOrder, [2, 0, 1, 3]);
  const result = finishRound(match, state);
  // Player 1's 2 was played and chopped — it is in no hand at round
  // end, so no leftover penalty exists anywhere in this round.
  assert.deepEqual(result.penalties, []);
  // Final = post-chop scores + round deltas (+2/+1/-1/-2 by place).
  assert.deepEqual(match.scores, [1, -2, 3, -2]);
  assert.equal(match.scores.reduce((a, b) => a + b, 0), 0);
});

test("scoring: unusedBombs enumerates exactly what countUnusedBombs counts (TASK 016)", () => {
  const pair = (r: string) => [c(r as Rank, "clubs"), c(r as Rank, "diamonds")];
  const cases: { hand: Card[]; want: unknown[] }[] = [
    { hand: quad("9"), want: [{ kind: "four-of-a-kind", rank: "9" }] },
    {
      // Six pairs in a run: two disjoint 3-pair sequences.
      hand: ["3", "4", "5", "6", "7", "8"].flatMap(pair),
      want: [
        { kind: "pair-sequence-3", from: "3", to: "5" },
        { kind: "pair-sequence-3", from: "6", to: "8" },
      ],
    },
    {
      // Five pairs: exactly one sequence (the DP's count is 1).
      hand: ["3", "4", "5", "6", "7"].flatMap(pair),
      want: [{ kind: "pair-sequence-3", from: "3", to: "5" }],
    },
    {
      // Quad closes the run it interrupts: quad 3s + pairs 4-5-6.
      hand: [...seq4(), c("3", "spades"), c("3", "hearts")],
      want: [
        { kind: "four-of-a-kind", rank: "3" },
        { kind: "pair-sequence-3", from: "4", to: "6" },
      ],
    },
    {
      // Triples count as pairs inside a run.
      hand: ["3", "4", "5"].flatMap((r) => [c(r as Rank, "clubs"), c(r as Rank, "diamonds"), c(r as Rank, "hearts")]),
      want: [{ kind: "pair-sequence-3", from: "3", to: "5" }],
    },
    {
      // Four 2s: a bomb, enumerated after everything else.
      hand: [c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts")],
      want: [{ kind: "four-of-a-kind", rank: "2" }],
    },
    { hand: [c("7", "clubs"), c("9", "diamonds")], want: [] },
  ];
  for (const { hand, want } of cases) {
    assert.deepEqual(unusedBombs(hand), want);
    assert.equal(unusedBombs(hand).length, countUnusedBombs(hand));
  }
});

test("scoring: penalty detail itemizes the held 2s and unused bombs behind the points (TASK 016)", () => {
  const { penalties } = scoreRound(
    [0, 1, 2, 3],
    [[], [], [], [c("2", "hearts"), ...quad("9")]],
  );
  assert.equal(penalties.length, 1);
  const [penalty] = penalties;
  assert.equal(penalty?.points, 2); // 1 for the 2 + 1 for the quad
  assert.deepEqual(penalty?.twos, [c("2", "hearts")]);
  assert.deepEqual(penalty?.bombs, [{ kind: "four-of-a-kind", rank: "9" }]);
  assert.equal(penalty!.points, penalty!.twos.length + penalty!.bombs.length);
});
