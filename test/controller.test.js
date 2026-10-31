import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, makeCard } from "../src/engine/cards.js";
import { newDeal, shuffle } from "../src/engine/deal.js";
import { chooseAction } from "../src/engine/ai.js";
import { seededRng } from "../src/engine/runner.js";
import { createController } from "../src/ui/controller.js";

const sync = (fn) => fn();
const c = makeCard;

function seededController(seed, summaries) {
  const rng = seededRng(seed);
  return createController({
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
}

// Drive seat 0 with the AI policy, like the runner does for all seats.
// CPU seats advance on their own through the synchronous scheduler.
function driveToEnd(controller) {
  for (let steps = 0; steps < 100000; steps++) {
    const s = controller.state;
    if (s.phase === "matchEnd") return;
    if (s.phase === "roundEnd") {
      controller.continueRound();
      continue;
    }
    assert.equal(s.phase, "playing");
    assert.equal(s.trick.currentPlayer, 0, "CPU turns should auto-advance");
    const action = chooseAction(s.trick, 0);
    const ok =
      action.type === "play" ? controller.humanPlay(action.cards) : controller.humanPass();
    assert.equal(ok, true, "the policy's own action must be accepted");
  }
  throw new Error("Match did not finish");
}

test("headless smoke: full matches run through the controller to a winner", () => {
  for (const seed of [5, 11, 42]) {
    const summaries = [];
    const controller = seededController(seed, summaries);
    controller.newMatch();
    driveToEnd(controller);
    const { match } = controller.state;
    assert.equal(controller.state.phase, "matchEnd");
    assert.notEqual(match.winner, null);
    assert.ok(match.scores[match.winner] >= 13);
    assert.ok(summaries.length > 0);
    const totals = [0, 0, 0, 0];
    for (const summary of summaries) {
      assert.equal(summary.deltas.reduce((a, b) => a + b, 0), 0, "zero-sum round");
      summary.deltas.forEach((d, p) => {
        totals[p] += d;
      });
    }
    assert.deepEqual(match.scores, totals);
    assert.ok(controller.state.log.length > 0);
  }
});

// A fixed deal where seat 0 holds the 3 of spades and must open.
function craftedDeal() {
  const mine = [
    c("3", "spades"), c("3", "hearts"), c("K", "spades"), c("2", "spades"),
    c("4", "diamonds"), c("5", "diamonds"), c("6", "diamonds"), c("7", "diamonds"),
    c("8", "diamonds"), c("9", "diamonds"), c("10", "diamonds"), c("J", "diamonds"),
    c("Q", "diamonds"),
  ];
  const mineIds = new Set(mine.map((card) => card.id));
  const rest = shuffle(
    createDeck().filter((card) => !mineIds.has(card.id)),
    seededRng(7),
  );
  const hands = [mine, [], [], []];
  rest.forEach((card, i) => hands[1 + (i % 3)].push(card));
  return hands;
}

test("illegal selections surface the engine error and change nothing", () => {
  const controller = createController({ schedule: sync, dealHands: craftedDeal });
  controller.newMatch();
  const s = controller.state;
  assert.equal(s.phase, "playing");
  assert.equal(s.trick.currentPlayer, 0);

  // Empty selection: UI-level message.
  assert.equal(controller.humanPlay([]), false);
  assert.match(s.message, /at least one card/);

  // Card not held: UI-level message.
  assert.equal(controller.humanPlay([c("A", "hearts")]), false);
  assert.match(s.message, /not in your hand/);

  // Opening lead without the 3 of spades: the engine's own error.
  assert.equal(controller.humanPlay([c("K", "spades")]), false);
  assert.match(s.message, /3 of spades/);
  assert.equal(s.trick.hands[0].length, 13);
  assert.equal(s.trick.currentPlayer, 0);

  // The leader cannot pass: engine error, still your turn.
  assert.equal(controller.humanPass(), false);
  assert.match(s.message, /must play, not pass/);
  assert.equal(s.trick.currentPlayer, 0);

  // Hint complies with the opening rule.
  const hint = controller.hint();
  assert.equal(hint.type, "play");
  assert.ok(hint.cards.some((card) => card.id === "3-spades"));

  // A legal play goes through and the CPUs answer on their own.
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.equal(s.trick.hands[0].length, 12);
  assert.equal(s.message, "");
});

test("log: a four of a kind played against a single 2 is logged as a bomb", () => {
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

test("log: a play that clears the trick is logged like any other play", () => {
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
