import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck, makeCard, sortCards, type Card, type Rank, type Suit,
} from "../src/engine/cards.js";
import { shuffle, deal } from "../src/engine/deal.js";
import { detectCombination } from "../src/engine/combinations.js";
import { beats } from "../src/engine/plays.js";
import { createTrickState, playCards, passTurn, hasComebackTurn, type TrickState } from "../src/engine/trick.js";
import { comebackAnswers, hasLiveComebackTurn, isDeadComebackTurn } from "../src/engine/comeback.js";
import { chooseAction } from "../src/engine/ai.js";
import { detectBomb, bombBeats, bombOnBombBeats, isComebackBomb } from "../src/engine/bombs.js";
import { detectInstantWin } from "../src/engine/instantWin.js";
import { scoreRound, scoreInstantWin, leftoverPenalty, countUnusedBombs, unusedBombs } from "../src/engine/scoring.js";
import { createMatch, startRound, applyInstantWin, finishRound, applyChop, applyBombedBombPenalty, applyTurn } from "../src/engine/match.js";
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

// ---------- bomb on a bomb (TASK 021) ----------

const run3high = () => [
  c("7", "clubs"), c("7", "diamonds"), c("8", "clubs"), c("8", "diamonds"),
  c("9", "clubs"), c("9", "diamonds"),
];
const run4high = () => [
  ...run3high(), c("10", "clubs"), c("10", "diamonds"),
];

test("bombs: bomb on a bomb — the ladder over bombs (TASK 021)", () => {
  // Same kind, strictly higher.
  assert.equal(bombOnBombBeats(run3high(), seq3()), true);
  assert.equal(bombOnBombBeats(seq3(), run3high()), false);
  assert.equal(bombOnBombBeats(seq3(), seq3()), false);
  // Equal ranks: the top pair's suit breaks the tie (hearts over diamonds).
  const run3heartsTop = [
    c("3", "spades"), c("3", "hearts"), c("4", "spades"), c("4", "hearts"),
    c("5", "spades"), c("5", "hearts"),
  ];
  assert.equal(bombOnBombBeats(run3heartsTop, seq3()), true);
  assert.equal(bombOnBombBeats(seq3(), run3heartsTop), false);
  // The 4-pair double run bombs ANY bomb, whatever its rank.
  assert.equal(bombOnBombBeats(seq4(), run3high()), true); // lowest 4-run over a high 3-run
  assert.equal(bombOnBombBeats(seq4(), quad("A")), true); // lowest 4-run over the top quad
  // ...but over another 4-pair run it must still be higher.
  assert.equal(bombOnBombBeats(run4high(), seq4()), true);
  assert.equal(bombOnBombBeats(seq4(), run4high()), false);
  // Four of a kind over four of a kind, by rank.
  assert.equal(bombOnBombBeats(quad("9"), quad("5")), true);
  assert.equal(bombOnBombBeats(quad("5"), quad("9")), false);
  // A four of a kind never answers a pair-run bomb.
  assert.equal(bombOnBombBeats(quad("A"), seq3()), false);
  assert.equal(bombOnBombBeats(quad("A"), seq4()), false);
  // A 3-pair run answers nothing but a lower 3-pair run.
  assert.equal(bombOnBombBeats(run3high(), seq4()), false);
  assert.equal(bombOnBombBeats(run3high(), quad("5")), false);
  // Non-bombs are never targets or answers here (bombing a 2 is bombBeats).
  assert.equal(bombOnBombBeats(seq3(), [c("2", "hearts")]), false);
  assert.equal(bombOnBombBeats(seq3(), [c("K", "spades"), c("K", "hearts")]), false);
  assert.equal(bombOnBombBeats([c("K", "spades"), c("K", "hearts")], seq3()), false);
});

test("trick bombs: a bomb on the table can be answered — higher same kind, or the 4-pair run", () => {
  const build = (p3Hand: Card[]) =>
    createTrickState(
      [
        [c("3", "spades"), c("Q", "diamonds")],
        [c("2", "hearts"), c("K", "spades")],
        [...seq3(), c("10", "clubs")],
        p3Hand,
      ],
      { leader: 0, openingLead: false },
    );
  // A higher 3-pair run answers the 3-pair bomb.
  const higher = build([...run3high(), c("J", "spades")]);
  playCards(higher, 0, [c("3", "spades")]);
  playCards(higher, 1, [c("2", "hearts")]);
  playCards(higher, 2, seq3());
  playCards(higher, 3, run3high());
  assert.equal(higher.currentPlay?.player, 3);
  assert.equal(higher.currentPlay?.type, "bomb");
  // A four of a kind cannot answer a pair-run bomb.
  const quadTry = build([...quad("9"), c("J", "spades")]);
  playCards(quadTry, 0, [c("3", "spades")]);
  playCards(quadTry, 1, [c("2", "hearts")]);
  playCards(quadTry, 2, seq3());
  assert.throws(() => playCards(quadTry, 3, quad("9")), /does not beat/);
  // The lowest 4-pair run answers even a high 3-pair bomb.
  const fourRun = createTrickState(
    [
      [c("3", "spades"), c("Q", "diamonds")],
      [c("2", "hearts"), c("K", "spades")],
      [...run3high(), c("10", "clubs")],
      [...seq4(), c("J", "spades")],
    ],
    { leader: 0, openingLead: false },
  );
  playCards(fourRun, 0, [c("3", "spades")]);
  playCards(fourRun, 1, [c("2", "hearts")]);
  playCards(fourRun, 2, run3high());
  playCards(fourRun, 3, seq4());
  assert.equal(fourRun.currentPlay?.player, 3);
});

test("trick bombs: a led four of a kind can be answered — higher quad or the 4-pair run", () => {
  const build = (p1Hand: Card[]) =>
    createTrickState(
      [quad("5").concat(c("Q", "diamonds")), p1Hand, [c("6", "diamonds"), c("J", "spades")], [c("7", "diamonds"), c("10", "spades")]],
      { leader: 0, openingLead: false },
    );
  const higherQuad = build([...quad("9"), c("K", "spades")]);
  playCards(higherQuad, 0, quad("5"));
  playCards(higherQuad, 1, quad("9"));
  assert.equal(higherQuad.currentPlay?.player, 1);
  const fourRun = build([...seq4(), c("K", "spades")]);
  playCards(fourRun, 0, quad("5"));
  playCards(fourRun, 1, seq4()); // any rank — the 4-pair run bombs any bomb
  assert.equal(fourRun.currentPlay?.player, 1);
  const lowQuad = build([...quad("4"), c("K", "spades")]);
  playCards(lowQuad, 0, quad("5"));
  assert.throws(() => playCards(lowQuad, 1, quad("4")), /does not beat/);
});

test("trick bombs: comeback against a bomb — only the comeback kinds (TASK 021)", () => {
  const build = (p1Hand: Card[]) =>
    createTrickState(
      [
        [c("3", "spades"), c("Q", "diamonds")],
        p1Hand,
        [c("2", "hearts"), c("K", "spades")],
        [...seq3(), c("J", "spades")],
      ],
      { leader: 0, openingLead: false },
    );
  // P1 passes, P2 plays a 2, P3 bombs it — P1's comeback turn now
  // faces the bomb, not the 2.
  const toBomb = (state: ReturnType<typeof build>) => {
    playCards(state, 0, [c("3", "spades")]);
    passTurn(state, 1);
    playCards(state, 2, [c("2", "hearts")]);
    playCards(state, 3, seq3());
    passTurn(state, 0);
  };
  // A higher 3-pair run is NOT a comeback bomb, even though it would
  // answer the bomb as a normal follow.
  const runAnswer = build([...run3high(), c("K", "diamonds")]);
  toBomb(runAnswer);
  assert.throws(() => playCards(runAnswer, 1, run3high()), /comeback/i);
  // The 4-pair double run answers the bomb as a comeback.
  const run4sh = [
    c("6", "spades"), c("6", "hearts"), c("7", "spades"), c("7", "hearts"),
    c("8", "spades"), c("8", "hearts"), c("9", "spades"), c("9", "hearts"),
  ];
  const fourRun = build([...run4sh, c("K", "diamonds")]);
  toBomb(fourRun);
  playCards(fourRun, 1, run4sh);
  assert.equal(fourRun.currentPlay?.player, 1);
  // A four of a kind still cannot answer a pair-run bomb, comeback or not.
  const quadAnswer = build([...quad("9"), c("8", "clubs")]);
  toBomb(quadAnswer);
  assert.throws(() => playCards(quadAnswer, 1, quad("9")), /comeback/i);
});

// ---------- live vs dead comeback turns (TASK 038) ----------

const ofRank = (rank: Rank, suits: Suit[]) => suits.map((suit) => c(rank, suit));
const pairsOf = (ranks: Rank[], suits: [Suit, Suit]) => ranks.flatMap((rank) => ofRank(rank, suits));
const ALL_SUITS: Suit[] = ["spades", "clubs", "diamonds", "hearts"];

// Seat 1 passes on seat 0's low lead, seat 2 drops `target` (a 2 /
// pair of 2s / triple 2s of the lead's shape), seats 3 and 0 pass:
// the turn is seat 1's, against the target, on the comeback gate.
function comebackOn2s(p1Hand: Card[], lead: Card[], target: Card[]): TrickState {
  const state = createTrickState(
    [[...lead, c("K", "diamonds")], p1Hand, [...target, c("Q", "spades")], [c("J", "spades"), c("5", "diamonds")]],
    { leader: 0, openingLead: false },
  );
  playCards(state, 0, lead);
  passTurn(state, 1);
  playCards(state, 2, target);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1);
  assert.equal(hasComebackTurn(state, 1), true, "the shape gate is open");
  return state;
}

// Seat 1 passes on 3♠, seat 2 plays 2♥, seat 3 bombs it with `bomb`,
// seat 0 passes: seat 1's comeback turn faces the bomb.
function comebackOnBomb(p1Hand: Card[], bomb: Card[]): TrickState {
  const state = createTrickState(
    [[c("3", "spades"), c("K", "diamonds")], p1Hand, [c("2", "hearts"), c("Q", "spades")], [...bomb, c("J", "spades")]],
    { leader: 0, openingLead: false },
  );
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1);
  playCards(state, 2, [c("2", "hearts")]);
  playCards(state, 3, bomb);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1);
  assert.equal(hasComebackTurn(state, 1), true, "the shape gate is open");
  return state;
}

// Live <=> a comeback-legal play exists. Checked against the engine
// itself: every listed answer is accepted by playCards, the AI's
// comeback decision agrees, and a dead turn's only exit is a pass.
function assertComeback(state: TrickState, live: boolean, label: string): void {
  const answers = comebackAnswers(state, 1);
  assert.equal(hasLiveComebackTurn(state, 1), live, `${label}: live`);
  assert.equal(isDeadComebackTurn(state, 1), !live, `${label}: dead`);
  assert.equal(answers.length > 0, live, `${label}: answers`);
  assert.equal(chooseAction(state, 1).type === "pass", !live, `${label}: AI agrees`);
  for (const answer of answers) {
    const copy = structuredClone(state);
    playCards(copy, 1, answer); // throws if the engine disagrees
    assert.equal(copy.currentPlay?.player, 1, `${label}: answer lands`);
  }
  const passed = structuredClone(state);
  passTurn(passed, 1); // the decline is always legal
}

test("comeback turns: against a single 2 or a pair of 2s, live only with a comeback bomb that beats it (TASK 038)", () => {
  const quad9 = ofRank("9", ALL_SUITS);
  const run4 = pairsOf(["5", "6", "7", "8"], ["clubs", "hearts"]);
  const run3 = pairsOf(["4", "5", "6"], ["clubs", "diamonds"]);
  const single = { lead: [c("3", "spades")], target: [c("2", "hearts")] };
  assertComeback(comebackOn2s([...quad9, c("4", "clubs")], single.lead, single.target), true, "quad vs 2");
  assertComeback(comebackOn2s([...run4, c("A", "clubs")], single.lead, single.target), true, "4-run vs 2");
  assertComeback(comebackOn2s([...run3, c("A", "clubs")], single.lead, single.target), false, "3-run vs 2");
  assertComeback(comebackOn2s([c("4", "clubs"), c("9", "hearts")], single.lead, single.target), false, "no bomb vs 2");
  const pair = { lead: [c("3", "spades"), c("3", "hearts")], target: [c("2", "diamonds"), c("2", "hearts")] };
  assertComeback(comebackOn2s([...quad9, c("4", "clubs")], pair.lead, pair.target), true, "quad vs 2s");
  assertComeback(comebackOn2s([...run4, c("A", "clubs")], pair.lead, pair.target), true, "4-run vs 2s");
  assertComeback(comebackOn2s([...run3, c("A", "clubs")], pair.lead, pair.target), false, "3-run vs 2s");
});

test("comeback turns: triple 2s are dead for every hand — quad and 4-pair run included (TASK 038)", () => {
  const strongest = [...ofRank("A", ALL_SUITS), ...pairsOf(["5", "6", "7", "8"], ["clubs", "hearts"]), c("4", "clubs")];
  const state = comebackOn2s(
    strongest,
    [c("3", "spades"), c("3", "hearts"), c("3", "diamonds")],
    [c("2", "clubs"), c("2", "diamonds"), c("2", "hearts")],
  );
  assertComeback(state, false, "triple 2s");
});

test("comeback turns: against a bomb, live only under the bomb-on-bomb ladder (TASK 038)", () => {
  const run3low = pairsOf(["3", "4", "5"], ["clubs", "diamonds"]);
  const run4low = pairsOf(["4", "5", "6", "7"], ["diamonds", "hearts"]);
  const run4high = pairsOf(["8", "9", "10", "J"], ["clubs", "hearts"]);
  const run4lower = pairsOf(["4", "5", "6", "7"], ["spades", "clubs"]); // same ranks, lower top card
  const quadK = ofRank("K", ALL_SUITS);
  const quad7 = ofRank("7", ALL_SUITS);
  const quad6 = ofRank("6", ALL_SUITS);
  // A four of a kind on the table: a higher quad or any 4-pair run answers.
  assertComeback(comebackOnBomb([...quadK, c("4", "spades")], quad7), true, "higher quad vs quad");
  assertComeback(comebackOnBomb([...quad6, c("4", "spades")], quad7), false, "lower quad vs quad");
  assertComeback(comebackOnBomb([...run4high, c("4", "spades")], quad7), true, "4-run vs quad");
  // A 3-pair run on the table: four of a kind never answers a pair run.
  assertComeback(comebackOnBomb([...quadK, c("10", "spades")], run3low), false, "quad vs 3-run");
  assertComeback(comebackOnBomb([...run4high, c("4", "spades")], run3low), true, "4-run vs 3-run");
  assertComeback(comebackOnBomb([...pairsOf(["8", "9", "10"], ["clubs", "hearts"]), c("4", "spades")], run3low), false, "higher 3-run is no comeback bomb");
  // A 4-pair run on the table: only a higher 4-pair run.
  assertComeback(comebackOnBomb([...run4high, c("A", "spades")], run4low), true, "higher 4-run vs 4-run");
  assertComeback(comebackOnBomb([...run4lower, c("A", "spades")], run4low), false, "lower 4-run vs 4-run");
  assertComeback(comebackOnBomb([...quadK, c("A", "spades")], run4low), false, "quad vs 4-run");
});

test("comeback turns: no gate, no comeback — a live follower and a decided passer are neither live nor dead (TASK 038)", () => {
  const state = comebackOn2s([...ofRank("9", ALL_SUITS), c("4", "clubs")], [c("3", "spades")], [c("2", "hearts")]);
  // Seat 0 passed this play normally earlier; it is not a candidate.
  assert.equal(hasComebackTurn(state, 0), false);
  assert.equal(isDeadComebackTurn(state, 0), false);
  assert.deepEqual(comebackAnswers(state, 0), []);
  passTurn(state, 1); // seat 1 declines its live comeback
  assert.equal(hasLiveComebackTurn(state, 1), false, "a declined comeback is spent");
  assert.equal(isDeadComebackTurn(state, 1), false);
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

test("match: two instant-win hands in one deal — the leader's clockwise priority picks the winner (TASK 047)", () => {
  // Seat 1 holds six pairs, seat 3 holds four 2s, seat 0 holds the
  // 3 of spades. The priority loop starts at the round's leader
  // (the 3 of spades holder) and walks clockwise, so seat 1 wins —
  // seat order decides, not the instant-win detection order (four
  // 2s is checked first inside detectInstantWin, and still loses).
  const sixPairs = [
    c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"), c("4", "diamonds"),
    c("5", "clubs"), c("5", "diamonds"), c("6", "clubs"), c("6", "diamonds"),
    c("9", "clubs"), c("9", "diamonds"), c("10", "clubs"), c("10", "diamonds"),
    c("K", "spades"),
  ];
  const fourTwos = [c("2", "spades"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts")];
  const used = new Set([...sixPairs, ...fourTwos, c("3", "spades")].map((card) => card.id));
  const rest = shuffle(createDeck().filter((card) => !used.has(card.id)), seededRng(5));
  const hands: Card[][] = [
    [c("3", "spades"), ...rest.slice(9, 21)],
    sixPairs,
    rest.slice(21, 34),
    [...fourTwos, ...rest.slice(0, 9)],
  ];
  assert.deepEqual(hands.map((h) => h.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map((card) => card.id)).size, 52);
  assert.equal(detectInstantWin(hands[0]), null);
  assert.equal(detectInstantWin(hands[1])?.kind, "six-pairs");
  assert.equal(detectInstantWin(hands[2]), null);
  assert.equal(detectInstantWin(hands[3])?.kind, "four-2s");
  const match = createMatch();
  const start = startRound(match, hands);
  assert.equal(start.type, "instant-win");
  if (start.type !== "instant-win") assert.fail("expected an instant-win start");
  assert.equal(start.winner, 1, "seat 1 is reached before seat 3 walking clockwise from the leader");
  assert.equal(start.kind, "six-pairs");
  // The locked payout: every other player pays the winner 2.
  const result = applyInstantWin(match, start.winner);
  assert.deepEqual(result.deltas, [-2, 6, -2, -2]);
  assert.deepEqual(match.scores, [-2, 6, -2, -2]);
  assert.equal(match.leader, 1, "the instant winner leads the next round");
  assert.equal(match.roundNumber, 2);
});

test("match: two instant-win hands in one deal — the leader themself wins first (TASK 047)", () => {
  // Seat 2 holds the 3 of spades inside a dragon straight; seat 0
  // holds six pairs. The priority loop checks the leader first,
  // so seat 2 wins before the walk ever reaches seat 0.
  const dragon = [
    c("3", "spades"), c("4", "clubs"), c("5", "clubs"), c("6", "clubs"),
    c("7", "clubs"), c("8", "clubs"), c("9", "clubs"), c("10", "clubs"),
    c("J", "clubs"), c("Q", "clubs"), c("K", "clubs"), c("A", "clubs"),
    c("4", "diamonds"),
  ];
  const sixPairs = [
    c("3", "hearts"), c("3", "diamonds"), c("5", "hearts"), c("5", "diamonds"),
    c("7", "hearts"), c("7", "diamonds"), c("9", "hearts"), c("9", "diamonds"),
    c("J", "hearts"), c("J", "diamonds"), c("K", "hearts"), c("K", "diamonds"),
    c("Q", "spades"),
  ];
  const used = new Set([...dragon, ...sixPairs].map((card) => card.id));
  const rest = shuffle(createDeck().filter((card) => !used.has(card.id)), seededRng(6));
  const hands: Card[][] = [sixPairs, rest.slice(0, 13), dragon, rest.slice(13, 26)];
  assert.deepEqual(hands.map((h) => h.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map((card) => card.id)).size, 52);
  assert.equal(detectInstantWin(hands[0])?.kind, "six-pairs");
  assert.equal(detectInstantWin(hands[1]), null);
  assert.equal(detectInstantWin(hands[2])?.kind, "dragon-straight");
  assert.equal(detectInstantWin(hands[3]), null);
  const match = createMatch();
  const start = startRound(match, hands);
  assert.equal(start.type, "instant-win");
  if (start.type !== "instant-win") assert.fail("expected an instant-win start");
  assert.equal(start.winner, 2, "the leader is checked first in the priority loop");
  assert.equal(start.kind, "dragon-straight");
  const result = applyInstantWin(match, start.winner);
  assert.deepEqual(result.deltas, [-2, -2, 6, -2]);
  assert.deepEqual(match.scores, [-2, -2, 6, -2]);
});

test("match: crossing 13 mid-round does not end the match — the target is checked at round end (TASK 047)", () => {
  // A restored save's scores (round 3, seat 1 on 12). Seat 0 leads
  // a single 2; seat 1 bombs it with four of a kind, and the bomb
  // penalty takes seat 1 to 13 MID-ROUND. Locked rules: the match
  // target is decided only when a round completes, so the winner
  // must still be undecided here and the round must play on.
  const match = createMatch();
  match.scores = [10, 12, 0, 0];
  match.roundNumber = 3;
  match.leader = 0;
  const twoSpades = c("2", "spades");
  const quadNines = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const used = new Set([twoSpades, ...quadNines].map((card) => card.id));
  const rest = shuffle(createDeck().filter((card) => !used.has(card.id)), seededRng(7));
  const hands: Card[][] = [
    [twoSpades, ...rest.slice(0, 12)],
    [...quadNines, ...rest.slice(12, 21)],
    rest.slice(21, 34),
    rest.slice(34, 47),
  ];
  assert.deepEqual(hands.map((h) => h.length), [13, 13, 13, 13]);
  for (const hand of hands) assert.equal(detectInstantWin(hand), null);
  const start = startRound(match, hands);
  assert.equal(start.type, "play");
  if (start.type !== "play") assert.fail("expected a played round");
  const state = start.state;
  assert.equal(state.currentPlayer, 0, "the recorded leader leads the restored round");
  const lead = applyTurn(match, state, 0, { type: "play", cards: [twoSpades] });
  assert.deepEqual(lead, { chop: null, bombedBomb: null });
  const bomb = applyTurn(match, state, 1, { type: "play", cards: quadNines });
  assert.deepEqual(bomb.chop, { payer: 0, payee: 1, points: 1 });
  assert.equal(bomb.bombedBomb, null);
  assert.deepEqual(match.scores, [9, 13, 0, 0], "the bomb penalty lands instantly, mid-round");
  assert.equal(match.winner, null, "13 mid-round decides nothing — the round plays on");
  assert.equal(state.roundOver, false);
  // Only when the round completes is the target checked: seat 1,
  // who finished first, takes the round's +2 as well and wins.
  const result = finishRound(match, finishedState([1, 0, 2, 3]));
  assert.deepEqual(result.deltas, [1, 2, -1, -2]);
  assert.deepEqual(match.scores, [10, 15, -1, -2]);
  assert.equal(result.matchWinner, 1);
  assert.equal(match.winner, 1, "the winner is decided at round end, not before");
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

// ---------- bombed-bomb penalty (TASK 021) ----------

test("bombed-bomb penalty: a bomb beaten by a bomb pays 1 to the beater, instantly", () => {
  const match = createMatch();
  assert.deepEqual(
    applyBombedBombPenalty(match, { player: 2, cards: seq3() }, run3high(), 3),
    { payer: 2, payee: 3, points: 1 },
  );
  // The scores moved immediately — no round end involved.
  assert.deepEqual(match.scores, [0, 0, -1, 1]);
  // A LED four of a kind counts: beaten by a higher four of a kind
  // or by a 4-pair double run, its owner pays the beater 1.
  for (const answer of [quad("9"), seq4()]) {
    const m2 = createMatch();
    assert.deepEqual(
      applyBombedBombPenalty(m2, { player: 0, cards: quad("5") }, answer, 1),
      { payer: 0, payee: 1, points: 1 },
    );
    assert.deepEqual(m2.scores, [-1, 1, 0, 0]);
  }
});

test("bombed-bomb penalty: no bombed bomb, no transfer — and never a chop at the same time", () => {
  const cases: [{ player: number; cards: Card[] } | null, Card[]][] = [
    [null, seq3()], // a lead
    [{ player: 0, cards: [c("2", "hearts")] }, seq3()], // a bombed 2 — the chop's event
    [{ player: 0, cards: [c("2", "clubs"), c("2", "diamonds")] }, seq4()], // a bombed pair of 2s
    [{ player: 0, cards: seq3() }, quad("9")], // a quad cannot answer a pair run
    [{ player: 0, cards: seq4() }, run3high()], // a 3-run cannot answer a 4-run
    [{ player: 0, cards: [c("K", "clubs"), c("K", "diamonds")] }, quad("9")], // target not a bomb
  ];
  for (const [prevPlay, cards] of cases) {
    const match = createMatch();
    assert.equal(applyBombedBombPenalty(match, prevPlay, cards, 1), null);
    assert.deepEqual(match.scores, [0, 0, 0, 0]);
  }
  // Mutual exclusion, both directions: the bomb-on-bomb event is not
  // a chop, and the chop event is not a bombed bomb.
  const match = createMatch();
  assert.equal(applyChop(match, { player: 2, cards: seq3() }, run3high(), 3), null);
  assert.equal(applyBombedBombPenalty(match, { player: 1, cards: [c("2", "hearts")] }, seq3(), 2), null);
  assert.deepEqual(match.scores, [0, 0, 0, 0]);
});

test("bombed-bomb penalty: chains cascade — each link settles when its bomb falls", () => {
  const match = createMatch();
  const state = createTrickState(
    [
      [c("2", "hearts"), c("Q", "diamonds")],
      [...seq3(), c("K", "spades")],
      [...run3high(), c("10", "clubs")],
      [c("4", "spades"), c("J", "diamonds")],
    ],
    { leader: 3, openingLead: false },
  );
  // Play the way the controller and runner do: capture the current
  // play, apply the play, then settle both penalty kinds.
  const play = (player: number, cards: Card[]) => {
    const prevPlay = state.currentPlay;
    playCards(state, player, cards);
    return {
      chop: applyChop(match, prevPlay, cards, player),
      bombed: applyBombedBombPenalty(match, prevPlay, cards, player),
    };
  };
  assert.deepEqual(play(3, [c("4", "spades")]), { chop: null, bombed: null });
  assert.deepEqual(play(0, [c("2", "hearts")]), { chop: null, bombed: null });
  // Link 1: player 1 bombs the 2 — player 0 pays 1 (the chop).
  assert.deepEqual(play(1, seq3()), {
    chop: { payer: 0, payee: 1, points: 1 },
    bombed: null,
  });
  assert.deepEqual(match.scores, [-1, 1, 0, 0]);
  // Link 2: player 2 bombs player 1's bomb — player 1 pays 1. The
  // point player 1 just collected does not cancel the debt; both
  // transfers stand.
  assert.deepEqual(play(2, run3high()), {
    chop: null,
    bombed: { payer: 1, payee: 2, points: 1 },
  });
  assert.deepEqual(match.scores, [-1, 0, 1, 0]);
  assert.equal(state.roundOver, false); // mid-round, exactly as ruled
  passTurn(state, 3);
  passTurn(state, 0);
  passTurn(state, 1); // the second bomb stands; the trick clears to player 2
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.trickNumber, 2);
});

test("bombed-bomb penalty: a bombed pair of 2s pays 2, then the bomb itself pays 1", () => {
  const match = createMatch();
  const state = createTrickState(
    [
      [c("2", "clubs"), c("2", "diamonds"), c("Q", "diamonds")],
      [...seq4(), c("K", "spades")],
      [...run4high(), c("10", "spades")],
      [c("4", "spades"), c("4", "hearts"), c("J", "diamonds")],
    ],
    { leader: 3, openingLead: false },
  );
  const play = (player: number, cards: Card[]) => {
    const prevPlay = state.currentPlay;
    playCards(state, player, cards);
    return {
      chop: applyChop(match, prevPlay, cards, player),
      bombed: applyBombedBombPenalty(match, prevPlay, cards, player),
    };
  };
  assert.deepEqual(play(3, [c("4", "spades"), c("4", "hearts")]), { chop: null, bombed: null });
  assert.deepEqual(play(0, [c("2", "clubs"), c("2", "diamonds")]), { chop: null, bombed: null });
  assert.deepEqual(play(1, seq4()), {
    chop: { payer: 0, payee: 1, points: 2 }, // 1 per 2, unchanged
    bombed: null,
  });
  assert.deepEqual(play(2, run4high()), {
    chop: null,
    bombed: { payer: 1, payee: 2, points: 1 },
  });
  assert.deepEqual(match.scores, [-2, 1, 1, 0]);
});

test("bombed-bomb penalty: a played-and-bombed bomb is never charged as a round-end leftover", () => {
  const match = createMatch();
  const state = createTrickState(
    [
      [c("3", "spades"), c("Q", "diamonds")],
      [c("2", "hearts"), c("K", "spades")],
      [...seq3(), c("9", "clubs")],
      [...run3high(), c("J", "spades"), c("2", "clubs")],
    ],
    { leader: 0, openingLead: false },
  );
  const play = (player: number, cards: Card[]) => {
    const prevPlay = state.currentPlay;
    playCards(state, player, cards);
    return {
      chop: applyChop(match, prevPlay, cards, player),
      bombed: applyBombedBombPenalty(match, prevPlay, cards, player),
    };
  };
  assert.deepEqual(play(0, [c("3", "spades")]), { chop: null, bombed: null });
  assert.deepEqual(play(1, [c("2", "hearts")]), { chop: null, bombed: null });
  assert.deepEqual(play(2, seq3()), {
    chop: { payer: 1, payee: 2, points: 1 },
    bombed: null,
  });
  assert.deepEqual(play(3, run3high()), {
    chop: null,
    bombed: { payer: 2, payee: 3, points: 1 },
  });
  assert.deepEqual(match.scores, [0, -1, 0, 1]);
  passTurn(state, 0);
  passTurn(state, 1);
  passTurn(state, 2); // the second bomb stands; the trick clears to player 3
  assert.equal(play(3, [c("J", "spades")]).chop, null); // player 3 down to the held 2
  assert.equal(play(0, [c("Q", "diamonds")]).chop, null); // player 0 out
  assert.equal(play(1, [c("K", "spades")]).chop, null); // player 1 out
  passTurn(state, 2);
  passTurn(state, 3);
  assert.equal(play(2, [c("9", "clubs")]).chop, null); // player 2 out; round over
  assert.equal(state.roundOver, true);
  assert.deepEqual(state.finishOrder, [0, 1, 2, 3]);
  const result = finishRound(match, state);
  // The only leftover is player 3's unplayed 2. Both pair runs were
  // PLAYED (and one was bombed) — a played bomb is in no hand at
  // round end, so neither is charged as an unused bomb.
  assert.deepEqual(result.penalties, [
    { player: 3, points: 1, paidTo: 0, twos: [c("2", "clubs")], bombs: [] },
  ]);
  assert.deepEqual(result.deltas, [3, 1, -1, -3]);
  // Final = post-transfer scores [0,-1,0,1] + round deltas.
  assert.deepEqual(match.scores, [3, 0, -1, -2]);
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
      // Five pairs: exactly one sequence (the DP's count is 1) —
      // and the 4-pair sequence present in the run names itself.
      hand: ["3", "4", "5", "6", "7"].flatMap(pair),
      want: [{ kind: "pair-sequence-4", from: "3", to: "6" }],
    },
    {
      // Exactly four consecutive pairs: on the DP tie the 4-pair
      // sequence names itself — not a 3-pair plus a spare pair.
      hand: ["4", "5", "6", "7"].flatMap(pair),
      want: [{ kind: "pair-sequence-4", from: "4", to: "7" }],
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
