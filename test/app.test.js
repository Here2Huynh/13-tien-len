import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, makeCard } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { detectBomb } from "../src/engine/bombs.js";
import { chooseAction } from "../src/engine/ai.js";
import { playMatch, seededRng } from "../src/engine/runner.js";
import { newDeal, shuffle } from "../src/engine/deal.js";
import {
  cardLabel, sortHand, validateSelection,
  emptyTrickView, applyToTrickView, describePlay, chopLogLine,
  roundResultRows, scoreRows,
} from "../src/ui/model.js";
import { createController } from "../src/ui/controller.js";

// Consolidated app suite: CPU policy, match runner, UI view-model,
// and the DOM-free controller. One file by design — the per-module
// suites were merged here. (Browser-level coverage lives in
// e2e.test.js; rules coverage in engine.test.js.)

const c = makeCard;
const ids = (cards) => cards.map((card) => card.id).sort();
const sync = (fn) => fn();

// ---------- CPU policy ----------

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

test("ai: on lead it plays the lowest legal combination", () => {
  const state = actingState([c("9", "spades"), c("5", "clubs"), c("5", "diamonds"), c("K", "spades")]);
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.deepEqual(ids(action.cards), ["5-clubs"]);
});

test("ai: the round-1 opening lead includes the 3 of spades, at its lowest", () => {
  const state = createTrickState([
    [c("3", "spades"), c("3", "hearts"), c("8", "clubs")],
    [c("9", "spades")],
    [c("10", "spades")],
    [c("J", "spades")],
  ]);
  const action = chooseAction(state, 0);
  assert.deepEqual(ids(action.cards), ["3-spades"]);
});

test("ai: on follow it plays the lowest play that beats the current play", () => {
  const state = actingState(
    [c("8", "clubs"), c("9", "spades"), c("7", "hearts"), c("4", "spades")],
    { player: 3, cards: [c("7", "spades")], type: "single" },
  );
  assert.deepEqual(ids(chooseAction(state, 0).cards), ["7-hearts"]);
});

test("ai: it passes when nothing beats the current play", () => {
  const vsSingle = actingState(
    [c("K", "spades"), c("Q", "clubs")],
    { player: 3, cards: [c("2", "hearts")], type: "single" },
  );
  assert.deepEqual(chooseAction(vsSingle, 0), { type: "pass" });
  const vsPair = actingState(
    [c("5", "spades"), c("5", "clubs"), c("K", "spades")],
    { player: 3, cards: [c("A", "spades"), c("A", "hearts")], type: "pair" },
  );
  assert.deepEqual(chooseAction(vsPair, 0), { type: "pass" });
});

const run3 = () => [
  c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"),
  c("4", "diamonds"), c("5", "clubs"), c("5", "diamonds"),
];
const four8s = () => [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];

test("ai: against a single 2 it bombs with the weakest sufficient bomb", () => {
  const state = actingState(
    [...run3(), ...four8s()],
    { player: 3, cards: [c("2", "diamonds")], type: "single" },
  );
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(action.cards)?.kind, "pair-sequence-3");
});

test("ai: against a pair of 2s the 4-pair run is chosen over four of a kind", () => {
  const state = actingState(
    [...run3(), c("6", "clubs"), c("6", "diamonds"), ...four8s()],
    { player: 3, cards: [c("2", "spades"), c("2", "hearts")], type: "pair" },
  );
  const action = chooseAction(state, 0);
  assert.equal(detectBomb(action.cards)?.kind, "pair-sequence-4");
});

function comebackState(p1Hand) {
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
    p1Hand,
    [c("2", "hearts"), c("K", "spades")],
    [c("6", "diamonds"), c("J", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1); // player 1 passes before the 2 lands
  playCards(state, 2, [c("2", "hearts")]);
  passTurn(state, 3);
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1); // comeback turn
  return state;
}

test("ai: on a comeback turn it uses a comeback-legal bomb, not the 3-pair run", () => {
  const four9s = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const action = chooseAction(comebackState([...run3(), ...four9s]), 1);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(action.cards)?.kind, "four-of-a-kind");
});

test("ai: on a comeback turn with only a 3-pair run it passes", () => {
  const state = comebackState([...run3(), c("8", "clubs")]);
  assert.deepEqual(chooseAction(state, 1), { type: "pass" });
});

// ---------- runner ----------

test("runner: full AI matches terminate, zero-sum, winner at 13+", () => {
  let chopPoints = 0;
  for (const seed of [1, 42, 2026]) {
    const result = playMatch(seed);
    assert.notEqual(result.winner, null);
    assert.ok(result.scores[result.winner] >= 13);
    const totals = [0, 0, 0, 0];
    for (const round of result.rounds) {
      assert.equal(round.deltas.reduce((a, b) => a + b, 0), 0);
      round.deltas.forEach((d, p) => {
        totals[p] += d;
      });
    }
    // Chops move scores mid-round (TASK 012): final scores are the
    // round deltas plus each player's net chops, still zero-sum.
    for (const chop of result.chops) {
      totals[chop.payer] -= chop.points;
      totals[chop.payee] += chop.points;
      chopPoints += chop.points;
    }
    assert.deepEqual(result.scores, totals);
    assert.equal(result.scores.reduce((a, b) => a + b, 0), 0);
  }
  assert.ok(chopPoints > 0, "chops should occur across the seeded matches");
});

test("runner: same seed, same match (deterministic)", () => {
  const a = playMatch(42);
  const b = playMatch(42);
  assert.equal(a.winner, b.winner);
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.rounds.length, b.rounds.length);
});

// ---------- UI view-model ----------

test("model: card labels carry glyph and color; hands sort low to high", () => {
  assert.deepEqual(cardLabel(c("2", "hearts")), {
    rank: "2", suit: "hearts", glyph: "♥", text: "2♥", color: "red",
  });
  assert.equal(cardLabel(c("3", "spades")).color, "black");
  const hand = [c("2", "hearts"), c("3", "spades"), c("K", "clubs")];
  assert.deepEqual(sortHand(hand).map((x) => x.id), ["3-spades", "K-clubs", "2-hearts"]);
});

test("model: selection validation covers turn, emptiness, and membership", () => {
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
});

test("model: trick view records plays and passes; a comeback play overwrites a pass", () => {
  let view = emptyTrickView();
  view = applyToTrickView(view, { type: "pass", player: 1 });
  assert.deepEqual(view.entries[1], { type: "pass" });
  view = applyToTrickView(view, { type: "play", player: 1, cards: [c("9", "spades")] });
  assert.equal(view.entries[1].type, "play");
});

test("model: play phrasing and result/score rows", () => {
  assert.equal(describePlay([c("K", "spades")]), "single K♠");
  assert.match(describePlay([...run3()]), /BOMB — 3-pair/);
  const rows = roundResultRows([2, 0, 3, 1], [1, -2, 2, -1]);
  assert.deepEqual(
    rows.map((r) => [r.name, r.place, r.delta]),
    [["Kenji", "1st", 2], ["You", "2nd", 1], ["Rosa", "3rd", -1], ["Mina", "4th", -2]],
  );
  assert.deepEqual(scoreRows([5, 12, 12, -3]).map((s) => s.isLeader), [false, true, true, false]);
});

test("model: a four of a kind is a bomb only when it functioned as one", () => {
  const quad = [c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts")];
  // Led, or played as a plain combination: plain phrasing, no BOMB.
  assert.equal(describePlay(quad), "four of a kind, high card 8♥");
  assert.equal(describePlay(quad, false), "four of a kind, high card 8♥");
  // Played against a single 2 / pair of 2s via the bomb path: a bomb.
  assert.equal(describePlay(quad, true), "a BOMB — four of a kind");
});

// ---------- controller ----------

test("controller: a full match runs headlessly to a winner at 13+", () => {
  const summaries = [];
  const rng = seededRng(42);
  const controller = createController({
    schedule: sync,
    dealHands: () => newDeal(rng),
    onChange: (state) => {
      if (
        (state.phase === "roundEnd" || state.phase === "matchEnd") &&
        state.roundSummary &&
        !summaries.includes(state.roundSummary)
      ) {
        summaries.push(state.roundSummary);
      }
    },
  });
  controller.newMatch();
  for (let steps = 0; steps < 100000 && controller.state.phase !== "matchEnd"; steps++) {
    const s = controller.state;
    if (s.phase === "roundEnd") {
      controller.continueRound();
      continue;
    }
    assert.equal(s.trick.currentPlayer, 0, "CPU turns should auto-advance");
    const action = chooseAction(s.trick, 0);
    const ok = action.type === "play" ? controller.humanPlay(action.cards) : controller.humanPass();
    assert.equal(ok, true);
  }
  const { match } = controller.state;
  assert.equal(controller.state.phase, "matchEnd");
  assert.ok(match.scores[match.winner] >= 13);
  const totals = [0, 0, 0, 0];
  for (const summary of summaries) {
    assert.equal(summary.deltas.reduce((a, b) => a + b, 0), 0);
    summary.deltas.forEach((d, p) => {
      totals[p] += d;
    });
    // Chops moved scores mid-round (TASK 012); they are part of the
    // final accounting alongside the round deltas.
    for (const chop of summary.chops) {
      totals[chop.payer] -= chop.points;
      totals[chop.payee] += chop.points;
    }
  }
  assert.deepEqual(match.scores, totals);
});

test("controller: illegal selections surface the engine error and change nothing", () => {
  const mine = [
    c("3", "spades"), c("3", "hearts"), c("K", "spades"), c("2", "spades"),
    c("4", "diamonds"), c("5", "diamonds"), c("6", "diamonds"), c("7", "diamonds"),
    c("8", "diamonds"), c("9", "diamonds"), c("10", "diamonds"), c("J", "diamonds"),
    c("Q", "diamonds"),
  ];
  const mineIds = new Set(mine.map((card) => card.id));
  const rest = shuffle(createDeck().filter((card) => !mineIds.has(card.id)), seededRng(7));
  const hands = [mine, [], [], []];
  rest.forEach((card, i) => hands[1 + (i % 3)].push(card));
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  assert.equal(s.phase, "playing");
  assert.equal(s.trick.currentPlayer, 0);
  assert.equal(controller.humanPlay([]), false);
  assert.match(s.message, /at least one card/);
  assert.equal(controller.humanPlay([c("A", "hearts")]), false);
  assert.match(s.message, /not in your hand/);
  assert.equal(controller.humanPlay([c("K", "spades")]), false);
  assert.match(s.message, /3 of spades/);
  assert.equal(s.trick.hands[0].length, 13);
  assert.equal(controller.humanPass(), false);
  assert.match(s.message, /must play, not pass/);
  const hint = controller.hint();
  assert.ok(hint.cards.some((card) => card.id === "3-spades"));
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.equal(s.trick.hands[0].length, 12);
});

test("controller: log — a four of a kind played against a single 2 is logged as a bomb", () => {
  const hands = [
    [c("3", "spades"), c("5", "clubs"), c("8", "diamonds")],
    [c("2", "clubs"), c("2", "diamonds")],
    [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts"), c("7", "clubs")],
    [c("10", "spades"), c("J", "diamonds")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // You open with the 3 of spades; Mina answers with a single 2 and
  // Kenji bombs it with four of a kind — all on the CPU chain.
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.ok(
    s.log.some((line) => line === "Kenji plays a BOMB — four of a kind."),
    `expected a bomb log line, got: ${s.log.join(" | ")}`,
  );
  assert.ok(s.log.some((line) => line === "Mina plays single 2♣."));
});

test("model: the chop log line names payer, points, and payee", () => {
  assert.equal(
    chopLogLine({ payer: 1, payee: 2, points: 1 }),
    "Chop: Mina's 2 was bombed — Mina pays 1 to Kenji.",
  );
  assert.equal(
    chopLogLine({ payer: 0, payee: 3, points: 2 }),
    "Chop: Your pair of 2s was bombed — You pay 2 to Rosa.",
  );
});

test("controller: a bombed 2 is chopped instantly — log line and scores move mid-round", () => {
  const hands = [
    [c("3", "spades"), c("5", "clubs"), c("8", "diamonds")],
    [c("2", "clubs"), c("2", "diamonds")],
    [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts"), c("7", "clubs")],
    [c("10", "spades"), c("J", "diamonds")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // You open with the 3 of spades; Mina answers with a single 2 and
  // Kenji bombs it — the chop lands on the same CPU chain.
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.ok(
    s.log.some((line) => line === "Chop: Mina's 2 was bombed — Mina pays 1 to Kenji."),
    `expected a chop log line, got: ${s.log.join(" | ")}`,
  );
  assert.deepEqual(s.match.scores, [0, -1, 1, 0]);
  assert.equal(s.phase, "playing"); // mid-round: the round did not end
});

test("controller: log — a play that clears the trick is logged like any other play", () => {
  // You lead the pair of 3s; Mina and Kenji hold only singles (they
  // pass), Rosa answers with her last cards (a pair of 4s, going
  // out), and your pair of kings then clears the trick — every other
  // seat is passed or out when it lands.
  const hands = [
    [c("3", "spades"), c("3", "hearts"), c("K", "clubs"), c("K", "diamonds")],
    [c("9", "spades"), c("J", "diamonds")],
    [c("10", "spades"), c("Q", "diamonds")],
    [c("4", "clubs"), c("4", "diamonds")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  assert.equal(controller.humanPlay([c("3", "spades"), c("3", "hearts")]), true);
  assert.equal(controller.humanPlay([c("K", "clubs"), c("K", "diamonds")]), true);
  assert.ok(
    s.log.some((line) => line === "You plays a pair, high card K♦."),
    `expected the clearing play in the log, got: ${s.log.join(" | ")}`,
  );
  assert.ok(s.trick.trickNumber >= 2, "the trick should have cleared");
});
