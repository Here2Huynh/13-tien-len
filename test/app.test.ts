import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, makeCard, type Card } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn, type TrickPlay } from "../src/engine/trick.js";
import { detectBomb } from "../src/engine/bombs.js";
import { chooseAction, type Action } from "../src/engine/ai.js";
import { playMatch, seededRng } from "../src/engine/runner.js";
import { newDeal, shuffle } from "../src/engine/deal.js";
import {
  cardLabel, sortHand, validateSelection,
  emptyTrickView, applyToTrickView, describePlay, bombPenaltyLogLine, bombedBombLogLine,
  comebackLogLine, penaltyLine, matchInProgress,
  roundResultRows, scoreRows,
  conjugate, seatVerb, playerErrorText, ENGINE_ERRORS, NO_SELECTION, SEAT_NAMES,
  bombPenaltyNet, bombPenaltyNoteLine,
  type SelectionCheck,
} from "../src/ui/model.js";
import { createController, type RoundSummary, type ControllerState } from "../src/ui/controller.js";
import { hasLiveComebackTurn, isDeadComebackTurn } from "../src/engine/comeback.js";
import { detectInstantWin } from "../src/engine/instantWin.js";

// Seeds whose hint-autopilot matches include live human AND CPU
// comeback turns, plus seeds 23 and 39 whose round 1 held a dead
// human comeback stop in the old build (on a 2, on a 3-pair-run
// bomb) — TASK 038 sweep, ~/workspace/13tl-traces-038/.
const SEEDED_LIVE_SEEDS = [53, 149, 23, 39];

// Consolidated app suite: CPU policy, match runner, UI view-model,
// and the DOM-free controller. One file by design — the per-module
// suites were merged here. (Browser-level coverage lives in
// e2e.test.js; rules coverage in engine.test.js.)

const c = makeCard;
const ids = (cards: Card[]) => cards.map((card) => card.id).sort();
const sync = (fn: () => void) => fn();

// Cards of a play action (fails the test on a pass).
const cardsOf = (action: Action): Card[] => {
  if (action.type !== "play") assert.fail("expected a play action");
  return action.cards;
};

// The error of a failed selection check (fails the test on ok).
const errOf = (check: SelectionCheck): string => {
  if (check.ok) assert.fail("expected a failed selection check");
  return check.error;
};

// ---------- CPU policy ----------

function actingState(hand: Card[], currentPlay: TrickPlay | null = null, player = 0) {
  const hands: Card[][] = [[], [], [], []];
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
  assert.deepEqual(ids(cardsOf(action)), ["5-clubs"]);
});

test("ai: the round-1 opening lead includes the 3 of spades, at its lowest", () => {
  const state = createTrickState([
    [c("3", "spades"), c("3", "hearts"), c("8", "clubs")],
    [c("9", "spades")],
    [c("10", "spades")],
    [c("J", "spades")],
  ]);
  const action = chooseAction(state, 0);
  assert.deepEqual(ids(cardsOf(action)), ["3-spades"]);
});

test("ai: on follow it plays the lowest play that beats the current play", () => {
  const state = actingState(
    [c("8", "clubs"), c("9", "spades"), c("7", "hearts"), c("4", "spades")],
    { player: 3, cards: [c("7", "spades")], type: "single" },
  );
  assert.deepEqual(ids(cardsOf(chooseAction(state, 0))), ["7-hearts"]);
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
  assert.equal(detectBomb(cardsOf(action))?.kind, "pair-sequence-3");
});

test("ai: against a pair of 2s the 4-pair run is chosen over four of a kind", () => {
  const state = actingState(
    [...run3(), c("6", "clubs"), c("6", "diamonds"), ...four8s()],
    { player: 3, cards: [c("2", "spades"), c("2", "hearts")], type: "pair" },
  );
  const action = chooseAction(state, 0);
  assert.equal(detectBomb(cardsOf(action))?.kind, "pair-sequence-4");
});

function comebackState(p1Hand: Card[]) {
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
  assert.equal(detectBomb(cardsOf(action))?.kind, "four-of-a-kind");
});

test("ai: on a comeback turn with only a 3-pair run it passes", () => {
  const state = comebackState([...run3(), c("8", "clubs")]);
  assert.deepEqual(chooseAction(state, 1), { type: "pass" });
});

// ---------- ai vs bombs (TASK 021) ----------

const run3high = () => [
  c("7", "clubs"), c("7", "diamonds"), c("8", "clubs"),
  c("8", "diamonds"), c("9", "clubs"), c("9", "diamonds"),
];
const run4 = () => [...run3(), c("6", "clubs"), c("6", "diamonds")];

test("ai: against a 3-pair bomb it answers with the weakest sufficient bomb", () => {
  // The hand also holds a low 4-pair run, which would answer any
  // bomb — but its 3-pair subsets (3-4-5 and 4-5-6) cannot answer
  // this target, so the weakest sufficient bomb is the higher
  // 3-pair run: same-kind answers come before the 4-pair run in the
  // policy's tier order, exactly as against a 2.
  const run3top = [
    c("J", "clubs"), c("J", "diamonds"), c("Q", "clubs"),
    c("Q", "diamonds"), c("K", "clubs"), c("K", "diamonds"),
  ];
  const run4low = [
    c("3", "spades"), c("3", "hearts"), c("4", "spades"), c("4", "hearts"),
    c("5", "spades"), c("5", "hearts"), c("6", "spades"), c("6", "hearts"),
  ];
  const target = [
    c("8", "spades"), c("8", "clubs"), c("9", "spades"),
    c("9", "clubs"), c("10", "spades"), c("10", "clubs"),
  ];
  const state = actingState([...run3top, ...run4low], { player: 3, cards: target, type: "bomb" });
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(cardsOf(action))?.kind, "pair-sequence-3");
  assert.deepEqual(ids(cardsOf(action)), ids(run3top));
});

test("ai: against a pair-run bomb a four of a kind is not sufficient — it passes", () => {
  const state = actingState(
    [...four8s(), c("K", "spades")],
    { player: 3, cards: run3(), type: "bomb" },
  );
  assert.deepEqual(chooseAction(state, 0), { type: "pass" });
});

test("ai: against a four of a kind bomb it answers with the 4-pair run", () => {
  const four7s = [c("7", "spades"), c("7", "clubs"), c("7", "diamonds"), c("7", "hearts")];
  const state = actingState(
    [...run4(), c("K", "spades")],
    { player: 3, cards: four7s, type: "four-of-a-kind" },
  );
  const action = chooseAction(state, 0);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(cardsOf(action))?.kind, "pair-sequence-4");
});

function comebackVsBombState(p1Hand: Card[]) {
  const state = createTrickState([
    [c("3", "spades"), c("4", "clubs"), c("Q", "diamonds")],
    p1Hand,
    [c("2", "hearts"), c("K", "spades")],
    [...run3(), c("J", "spades")],
  ]);
  playCards(state, 0, [c("3", "spades")]);
  passTurn(state, 1); // player 1 passes before the 2 lands
  playCards(state, 2, [c("2", "hearts")]);
  playCards(state, 3, run3()); // the bomb lands after the pass
  passTurn(state, 0);
  assert.equal(state.currentPlayer, 1); // comeback turn, facing the bomb
  return state;
}

test("ai: on a comeback turn against a bomb it uses the 4-pair run, not the 3-pair run", () => {
  const run4sh = [
    c("6", "spades"), c("6", "hearts"), c("7", "spades"), c("7", "hearts"),
    c("8", "spades"), c("8", "hearts"), c("9", "spades"), c("9", "hearts"),
  ];
  const action = chooseAction(comebackVsBombState([...run4sh, c("K", "diamonds")]), 1);
  assert.equal(action.type, "play");
  assert.equal(detectBomb(cardsOf(action))?.kind, "pair-sequence-4");
  const runOnly = chooseAction(comebackVsBombState([...run3high(), c("K", "diamonds")]), 1);
  assert.deepEqual(runOnly, { type: "pass" });
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
  assert.match(errOf(validateSelection(state, 0, [])), /at least one card/);
  assert.match(errOf(validateSelection(state, 1, [c("4", "spades")])), /not your turn/);
  assert.match(errOf(validateSelection(state, 0, [c("A", "hearts")])), /not in your hand/);
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
  const summaries: RoundSummary[] = [];
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
    assert.equal(s.trick!.currentPlayer, 0, "CPU turns should auto-advance");
    const action = chooseAction(s.trick!, 0);
    const ok = action.type === "play" ? controller.humanPlay(action.cards) : controller.humanPass();
    assert.equal(ok, true);
  }
  const { match } = controller.state;
  assert.equal(controller.state.phase, "matchEnd");
  assert.ok(match);
  const winner = match.winner;
  assert.ok(winner !== null);
  assert.ok(match.scores[winner] >= 13);
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
  const hands: Card[][] = [mine, [], [], []];
  rest.forEach((card, i) => hands[1 + (i % 3)].push(card));
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  assert.equal(s.phase, "playing");
  assert.equal(s.trick!.currentPlayer, 0);
  assert.equal(controller.humanPlay([]), false);
  assert.match(s.message, /at least one card/);
  assert.equal(controller.humanPlay([c("A", "hearts")]), false);
  assert.match(s.message, /not in your hand/);
  assert.equal(controller.humanPlay([c("K", "spades")]), false);
  assert.match(s.message, /must include the 3♠/);
  assert.equal(s.trick!.hands[0].length, 13);
  assert.equal(controller.humanPass(), false);
  assert.match(s.message, /can't pass — play any set/);
  const hint = controller.hint();
  assert.ok(hint);
  assert.ok(cardsOf(hint).some((card) => card.id === "3-spades"));
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.equal(s.trick!.hands[0].length, 12);
});

test("controller: newMatch seed restores points and round (TASK 031)", () => {
  const controller = createController({ schedule: sync, dealHands: () => newDeal(seededRng(11)) });
  controller.newMatch({ scores: [5, -2, 3, 0], round: 4 });
  const s = controller.state;
  assert.equal(s.phase, "playing");
  assert.deepEqual(s.match!.scores, [5, -2, 3, 0]);
  assert.equal(s.match!.roundNumber, 4);
  assert.ok(
    s.log.some((line) => line.startsWith("Round 4:")),
    "the saved round is the round dealt",
  );
});

test("controller: lastTrickWinner is the standing play's owner at every mid-round clear (TASK 049)", () => {
  // Independent oracle: the winner of a cleared trick is whoever
  // made the last play in the log before the clear — read off the
  // log lines, not off any engine field (the engine's own record
  // is nulled by the clear). A mid-round clear is an emission in
  // phase "playing" whose trickId moved within the same round.
  const playLine = /^(You|Mina|Kenji|Rosa) plays? /;
  let prev: { trickId: number; roundId: number; phase: string } | null = null;
  let clears = 0;
  // One rng stream for the whole match (the runner's method):
  // a fresh seededRng per deal would redeal the identical hands
  // every round — and seed 101's first deal is an instant win.
  const rng = seededRng(101);
  const controller = createController({
    schedule: sync,
    dealHands: () => newDeal(rng),
    onChange: (s) => {
      if (
        prev && s.phase === "playing" &&
        s.trickId !== prev.trickId && s.roundId === prev.roundId && prev.phase === "playing"
      ) {
        clears++;
        const plays = s.log.filter((line) => playLine.test(line));
        const lastPlay = plays[plays.length - 1];
        assert.ok(lastPlay, "a clear implies a standing play was logged");
        const winner = SEAT_NAMES.indexOf(playLine.exec(lastPlay)![1] as string);
        assert.equal(
          s.lastTrickWinner, winner,
          "the captured winner is the standing play's owner",
        );
      }
      prev = { trickId: s.trickId, roundId: s.roundId, phase: s.phase };
    },
  });
  controller.newMatch();
  let guard = 0;
  while (controller.state.phase !== "matchEnd") {
    if (++guard > 200000) throw new Error("match never ended");
    if (controller.state.phase === "roundEnd") { controller.continueRound(); continue; }
    if (controller.state.phase === "playing") {
      const action = controller.hint();
      assert.ok(action);
      if (action.type === "pass") controller.humanPass();
      else assert.ok(controller.humanPlay(action.cards));
    }
  }
  assert.ok(clears >= 50, `the sweep covered a real match's worth of clears (saw ${clears})`);
});

test("controller: a seeded start logs the resume line; an unseeded start logs the new-match line (TASK 039)", () => {
  const resumed = createController({ schedule: sync, dealHands: () => newDeal(seededRng(11)) });
  resumed.newMatch({ scores: [5, -2, 3, 0], round: 4 });
  assert.equal(
    resumed.state.log[0],
    "Match resumed — Round 4 · You 5 · Mina -2 · Kenji 3 · Rosa 0.",
    "the restored match opens with the resume line, not the new-match line",
  );
  const fresh = createController({ schedule: sync, dealHands: () => newDeal(seededRng(11)) });
  fresh.newMatch();
  assert.equal(fresh.state.log[0], "New match — first to 13.");
});

test("controller: a restored match's round is led by the 3 of spades holder (TASK 046)", () => {
  // The TASK 039 save carries scores + round only — no leader —
  // so a restored match's Match.leader is null, and the resumed
  // round falls back to the opening rule: whoever was dealt the
  // 3 of spades leads it. (Before TASK 046 this only worked
  // because an `as number` cast smuggled the null past the types
  // and a typeof check downstream caught it; the leader is now
  // number | null end-to-end and the fallback is the typed path.)
  // A dormant scheduler: the dealt state is inspected before any
  // CPU move can disturb it (the sync scheduler would already
  // have played the opening lead, 3 of spades included).
  const controller = createController({ schedule: () => {}, dealHands: () => newDeal(seededRng(11)) });
  controller.newMatch({ scores: [5, -2, 3, 0], round: 4 });
  const s = controller.state;
  assert.equal(s.match!.leader, null, "a restored match has no recorded leader");
  const trick = s.trick!;
  const holder = trick.hands.findIndex((hand) => hand.some((card) => card.id === "3-spades"));
  assert.ok(holder >= 0, "someone holds the 3 of spades");
  assert.equal(trick.leader, holder, "the 3 of spades holder leads the resumed round");
  assert.equal(trick.currentPlayer, holder, "and takes the first turn");
});

test("controller: newMatch without a seed is a fresh 0-0 round 1 (TASK 031)", () => {
  const controller = createController({ schedule: sync, dealHands: () => newDeal(seededRng(11)) });
  controller.newMatch({ scores: [5, -2, 3, 0], round: 4 });
  controller.newMatch();
  assert.deepEqual(controller.state.match!.scores, [0, 0, 0, 0]);
  assert.equal(controller.state.match!.roundNumber, 1);
});

test("model: matchInProgress — true only for a live, undecided match across every phase (TASK 040)", () => {
  // Nothing to lose before the first deal.
  assert.equal(matchInProgress(null), false);
  // Drive a real match through every phase and check the predicate
  // agrees with the phase at each step: idle → never; playing and
  // roundEnd → in progress; matchEnd → not (the match is decided).
  const controller = createController({ schedule: sync, dealHands: () => newDeal(seededRng(40)) });
  assert.equal(controller.state.phase, "idle");
  assert.equal(matchInProgress(controller.state.match), false);
  controller.newMatch();
  // Read through a function: the idle assertion above would
  // otherwise narrow the phase for the rest of the test.
  const live = (): ControllerState => controller.state;
  const seen = new Set<string>();
  for (let guard = 0; guard < 200000 && live().phase !== "matchEnd"; guard++) {
    const { phase, match } = live();
    seen.add(phase);
    assert.equal(matchInProgress(match), true, `in progress during ${phase}`);
    if (phase === "roundEnd") {
      controller.continueRound();
      continue;
    }
    const action = controller.hint();
    if (!action || action.type === "pass") controller.humanPass();
    else controller.humanPlay(action.cards);
  }
  assert.equal(live().phase, "matchEnd");
  assert.ok(seen.has("playing") && seen.has("roundEnd"), "both live phases were checked");
  assert.equal(matchInProgress(live().match), false, "a decided match has nothing to lose");
  // A fresh New Match is in progress again.
  controller.newMatch();
  assert.equal(matchInProgress(controller.state.match), true);
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

test("model: the bomb penalty log line names payer, points, and payee", () => {
  assert.equal(
    bombPenaltyLogLine({ payer: 1, payee: 2, points: 1 }),
    "Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed.",
  );
  assert.equal(
    bombPenaltyLogLine({ payer: 1, payee: 2, points: 2 }),
    "Bomb penalty: Mina pays 2 to Kenji — her pair of 2s was bombed.",
  );
  assert.equal(
    bombPenaltyLogLine({ payer: 2, payee: 0, points: 1 }),
    "Bomb penalty: Kenji pays 1 to You — his 2 was bombed.",
  );
  assert.equal(
    bombPenaltyLogLine({ payer: 0, payee: 2, points: 1 }),
    "Bomb penalty: You pay 1 to Kenji — your 2 was bombed.",
  );
  assert.equal(
    bombPenaltyLogLine({ payer: 0, payee: 3, points: 2 }),
    "Bomb penalty: You pay 2 to Rosa — your pair of 2s was bombed.",
  );
});

test("model: the bombed-bomb log line names payer and payee (TASK 021)", () => {
  assert.equal(
    bombedBombLogLine({ payer: 1, payee: 2, points: 1 }),
    "Bomb penalty: Mina pays 1 to Kenji — her bomb was bombed.",
  );
  assert.equal(
    bombedBombLogLine({ payer: 2, payee: 0, points: 1 }),
    "Bomb penalty: Kenji pays 1 to You — his bomb was bombed.",
  );
  assert.equal(
    bombedBombLogLine({ payer: 0, payee: 3, points: 1 }),
    "Bomb penalty: You pay 1 to Rosa — your bomb was bombed.",
  );
  assert.equal(
    bombedBombLogLine({ payer: 3, payee: 1, points: 1 }),
    "Bomb penalty: Rosa pays 1 to Mina — her bomb was bombed.",
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
    s.log.some((line) => line === "Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed."),
    `expected a bomb penalty log line, got: ${s.log.join(" | ")}`,
  );
  assert.deepEqual(s.match!.scores, [0, -1, 1, 0]);
  assert.equal(s.phase, "playing"); // mid-round: the round did not end
});

test("controller: a bombed bomb pays 1 instantly — chain settles on the CPU chain (TASK 021)", () => {
  const hands = [
    [c("3", "spades"), c("8", "hearts"), c("Q", "diamonds")],
    [c("2", "clubs"), c("2", "diamonds")],
    [
      c("4", "clubs"), c("4", "diamonds"), c("5", "clubs"), c("5", "diamonds"),
      c("6", "clubs"), c("6", "diamonds"), c("J", "spades"),
    ],
    [
      c("7", "clubs"), c("7", "diamonds"), c("8", "clubs"), c("8", "diamonds"),
      c("9", "clubs"), c("9", "diamonds"), c("10", "spades"),
    ],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // You open with the 3 of spades; Mina answers with a single 2,
  // Kenji bombs it with a 3-pair double run, and Rosa bombs Kenji's
  // bomb with a higher one — all on the CPU chain.
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  const at = (line: string) => s.log.indexOf(line);
  assert.ok(at("Mina plays single 2♣.") >= 0, `log: ${s.log.join(" | ")}`);
  assert.ok(at("Kenji plays a BOMB — 3-pair double run.") > at("Mina plays single 2♣."));
  assert.ok(at("Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed.") > at("Kenji plays a BOMB — 3-pair double run."));
  assert.ok(at("Rosa plays a BOMB — 3-pair double run.") > at("Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed."));
  assert.ok(at("Bomb penalty: Kenji pays 1 to Rosa — his bomb was bombed.") > at("Rosa plays a BOMB — 3-pair double run."));
  // Mina paid 1 for her 2; Kenji collected 1 and paid 1; Rosa is up 1.
  assert.deepEqual(s.match!.scores, [0, -1, 0, 1]);
  assert.equal(s.phase, "playing"); // mid-round: the round did not end
  assert.equal(s.trick!.currentPlay!.player, 3); // Rosa's bomb is on top
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
    s.log.some((line) => line === "You play a pair, high card K♦."),
    `expected the clearing play in the log, got: ${s.log.join(" | ")}`,
  );
  assert.ok(s.trick!.trickNumber >= 2, "the trick should have cleared");
});

test("model: penaltyLine itemizes held 2s and unused bombs with per-cause points (TASK 016)", () => {
  assert.equal(
    penaltyLine({
      player: 3, points: 3, paidTo: 0,
      twos: [c("2", "spades"), c("2", "hearts")],
      bombs: [{ kind: "four-of-a-kind", rank: "9" }],
    }),
    "Penalty: Rosa pays 3 to You: 2♠, 2♥ held (2 pts), four 9s unused (1 pt).",
  );
  assert.equal(
    penaltyLine({ player: 2, points: 1, paidTo: 1, twos: [c("2", "diamonds")], bombs: [] }),
    "Penalty: Kenji pays 1 to Mina: 2♦ held (1 pt).",
  );
  assert.equal(
    penaltyLine({
      player: 0, points: 1, paidTo: 2, twos: [],
      bombs: [{ kind: "pair-sequence-3", from: "4", to: "6" }],
    }),
    "Penalty: You pay 1 to Kenji: a 3-pair double run (4s–6s) unused (1 pt).",
  );
  assert.equal(
    penaltyLine({
      player: 1, points: 1, paidTo: 0, twos: [],
      bombs: [{ kind: "pair-sequence-4", from: "3", to: "6" }],
    }),
    "Penalty: Mina pays 1 to You: a 4-pair double run (3s–6s) unused (1 pt).",
  );
  // The exact-four-pairs holding (4s–7s) renders as the 4-pair bomb
  // it is (TASK 016 tie-break refinement).
  assert.equal(
    penaltyLine({
      player: 3, points: 1, paidTo: 0, twos: [],
      bombs: [{ kind: "pair-sequence-4", from: "4", to: "7" }],
    }),
    "Penalty: Rosa pays 1 to You: a 4-pair double run (4s–7s) unused (1 pt).",
  );
});

test("model: comebackLogLine speaks for the human and CPU seats (TASK 016)", () => {
  assert.equal(comebackLogLine(0), "You are back in the trick.");
  assert.equal(comebackLogLine(1), "Mina is back in the trick.");
});

test("controller: log — a pass locks you out, and a comeback bomb logs the return (TASK 016)", () => {
  const seq3 = [c("3", "clubs"), c("3", "diamonds"), c("4", "clubs"), c("4", "diamonds"), c("5", "clubs"), c("5", "diamonds")];
  const quad9 = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const hands = [
    [...seq3, ...quad9],
    [c("3", "spades"), c("2", "hearts")],
    [c("6", "diamonds"), c("J", "spades")],
    [c("8", "clubs"), c("10", "diamonds")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // Mina leads the 3 of spades; Kenji and Rosa answer up the ladder.
  // Nothing you hold beats the 8 but the quad (no bomb target), so
  // you pass while the trick is still live: locked out.
  assert.equal(controller.humanPass(), true);
  assert.ok(
    s.log.some((line) => line === "You pass — locked out."),
    `expected your lockout line, got: ${s.log.join(" | ")}`,
  );
  // The chain ran on: Mina's 2 landed, Kenji and Rosa passed (locked
  // out too), and your comeback turn is up.
  assert.ok(s.log.some((line) => line === "Kenji passes — locked out."));
  assert.ok(s.log.some((line) => line === "Rosa passes — locked out."));
  assert.equal(s.trick!.currentPlayer, 0);
  // You return with the quad: play line, return line, then the bomb
  // penalty for Mina's bombed 2 — in that order, exactly one return.
  assert.equal(controller.humanPlay(quad9), true);
  assert.deepEqual(
    s.log.filter((line) => line.includes("back in the trick")),
    ["You are back in the trick."],
  );
  const playAt = s.log.indexOf("You play a BOMB — four of a kind.");
  assert.ok(playAt >= 0, `expected the bomb play line, got: ${s.log.join(" | ")}`);
  assert.equal(s.log[playAt + 1], "You are back in the trick.");
  assert.equal(s.log[playAt + 2], "Bomb penalty: Mina pays 1 to You — her 2 was bombed.");
});

test("controller: log — a pass that closes the trick makes no lockout claim (TASK 016)", () => {
  // TASK 038: your hand carries four 9s, so the comeback turn below
  // is LIVE (a dead one is now declined for you and never offered).
  const quad9 = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  const hands = [
    [c("4", "clubs"), c("7", "diamonds"), ...quad9],
    [c("3", "spades"), c("K", "diamonds")],
    [c("2", "clubs"), c("6", "spades"), c("8", "spades")],
    [c("5", "diamonds"), c("J", "clubs")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // Chain: Mina leads the 3 of spades, Kenji answers 6♠, Rosa J♣.
  // You pass with Mina still live behind you (K♦): locked out.
  assert.equal(controller.humanPass(), true);
  assert.ok(
    s.log.some((line) => line === "You pass — locked out."),
    `expected your lockout line, got: ${s.log.join(" | ")}`,
  );
  // Mina plays K♦ (going out), Kenji answers with the 2♣, Rosa
  // passes. Mina is finished and Kenji holds the play, so your
  // comeback-decline pass closes the trick: plain line, no claim.
  assert.equal(s.trick!.currentPlayer, 0);
  assert.equal(hasLiveComebackTurn(s.trick!, 0), true, "your comeback turn is live");
  const trickBefore = s.trick!.trickNumber;
  const before = s.log.length;
  assert.equal(controller.humanPass(), true);
  assert.equal(s.log[before], "You pass.");
  assert.equal(s.trick!.trickNumber, trickBefore + 1, "the decline closed the trick");
});

// ---------- dead comeback turns (TASK 038) ----------

// Every state the controller emits while a round is in play, cloned.
function recordEmits(dealHands: () => Card[][]) {
  const emitted: ControllerState[] = [];
  const controller = createController({
    schedule: sync,
    dealHands,
    onChange: (state) => emitted.push(structuredClone(state)),
  });
  return { controller, emitted };
}

// Prompt honesty: an emitted playing state never hands the turn to a
// locked-out seat unless that seat holds a comeback-legal answer.
function assertNoDeadTurnOffered(emitted: ControllerState[]): void {
  for (const state of emitted) {
    if (state.phase !== "playing" || !state.trick) continue;
    const player = state.trick.currentPlayer;
    assert.equal(isDeadComebackTurn(state.trick, player), false, `dead turn offered to seat ${player}`);
    if (state.trick.passed.includes(player)) {
      assert.equal(hasLiveComebackTurn(state.trick, player), true, `locked-out seat ${player} prompted without a live answer`);
    }
  }
}

test("controller: a dead human comeback turn is declined for you — no stop, no pass line, same outcome (TASK 038)", () => {
  // The TASK 016 fixture with no bomb in your hand: Kenji's 2♣
  // opens your comeback gate, but nothing you hold can come back.
  const hands = [
    [c("4", "clubs"), c("7", "diamonds"), c("9", "spades")],
    [c("3", "spades"), c("K", "diamonds")],
    [c("2", "clubs"), c("6", "spades"), c("8", "spades")],
    [c("5", "diamonds"), c("J", "clubs")],
  ];
  const { controller, emitted } = recordEmits(() => hands);
  controller.newMatch();
  const s = controller.state;
  assert.equal(controller.humanPass(), true); // the live lockout pass on J♣
  // Old build: the turn stopped on you after Rosa's pass (only Pass
  // legal) and logged "You passes." New: that forced pass is made
  // for you unseen, the trick clears to Kenji exactly as it did
  // then, and he leads his last card.
  const from = s.log.indexOf("Kenji plays single 2♣.");
  assert.ok(from >= 0, s.log.join(" | "));
  assert.deepEqual(s.log.slice(from), [
    "Kenji plays single 2♣.",
    "Rosa passes — locked out.",
    "Kenji plays single 8♠.",
    "Rosa passes — locked out.",
  ]);
  assert.equal(s.trick!.trickNumber, 2, "the auto-decline cleared trick 1");
  assert.equal(s.trick!.leader, 2, "the 2♣'s owner leads next, as after the old forced pass");
  assert.equal(s.trick!.currentPlayer, 0);
  assert.equal(s.trick!.passed.includes(0), false, "your turn is a normal one");
  assertNoDeadTurnOffered(emitted);
});

test("controller: triple 2s never open a turn — even holding four of a kind (TASK 038)", () => {
  // You lead triple 3s; Mina, Kenji, Rosa raise; you pass (holding
  // four aces); Mina drops triple 2s. Your comeback gate opens on
  // shape alone, but nothing beats triple 2s: dead, declined unseen.
  const hands = [
    [c("3", "spades"), c("3", "hearts"), c("3", "diamonds"),
      c("A", "spades"), c("A", "clubs"), c("A", "diamonds"), c("A", "hearts"), c("K", "hearts")],
    [c("5", "spades"), c("5", "clubs"), c("5", "diamonds"), c("2", "clubs"), c("2", "diamonds"), c("2", "hearts"), c("K", "spades")],
    [c("6", "spades"), c("6", "clubs"), c("6", "diamonds"), c("Q", "spades")],
    [c("7", "spades"), c("7", "clubs"), c("7", "diamonds"), c("J", "spades")],
  ];
  const { controller, emitted } = recordEmits(() => hands);
  controller.newMatch();
  const s = controller.state;
  assert.equal(controller.humanPlay([c("3", "spades"), c("3", "hearts"), c("3", "diamonds")]), true);
  assert.equal(s.trick!.currentPlayer, 0, "back to you after three raises");
  assert.equal(controller.humanPass(), true);
  const from = s.log.indexOf("Mina plays a triple, high card 2♥.");
  assert.ok(from >= 0, s.log.join(" | "));
  // Old build: "You passes." (the forced decline that closed the
  // trick) sat between Rosa's pass and Mina's lead.
  assert.deepEqual(s.log.slice(from, from + 4), [
    "Mina plays a triple, high card 2♥.",
    "Kenji passes — locked out.",
    "Rosa passes — locked out.",
    "Mina plays single K♠.",
  ]);
  assert.equal(s.trick!.trickNumber, 2);
  assert.equal(s.trick!.leader, 1, "triple 2s won the trick for Mina");
  assertNoDeadTurnOffered(emitted);
});

test("controller: live comebacks are still offered — four of a kind and the 4-pair run (TASK 038)", () => {
  const run4 = (["5", "6", "7", "8"] as const).flatMap((r) => [c(r, "clubs"), c(r, "hearts")]);
  const quad9 = [c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")];
  for (const [label, bomb] of [["four of a kind", quad9], ["4-pair run", run4]] as const) {
    // Mina leads 3♠, Kenji and Rosa raise, you pass, Mina tops it
    // with the 2♥: your comeback is live, so the turn stops on you.
    const hands = [
      [...bomb, c("K", "clubs")],
      [c("3", "spades"), c("2", "hearts"), c("5", "spades")],
      [c("4", "diamonds"), c("J", "spades")],
      [c("6", "diamonds"), c("Q", "diamonds")],
    ];
    const { controller, emitted } = recordEmits(() => hands);
    controller.newMatch();
    const s = controller.state;
    assert.equal(s.trick!.currentPlayer, 0, label);
    assert.equal(controller.humanPass(), true, label);
    assert.equal(s.trick!.currentPlayer, 0, `${label}: stops on your comeback`);
    assert.ok(s.trick!.passed.includes(0), `${label}: you are a passer`);
    assert.equal(s.trick!.currentPlay!.cards[0].id, "2-hearts", label);
    assert.equal(hasLiveComebackTurn(s.trick!, 0), true, label);
    assert.deepEqual(ids(cardsOf(controller.hint()!)), ids([...bomb]), `${label}: Hint offers the bomb`);
    assert.equal(controller.humanPlay([...bomb]), true, label);
    assert.ok(s.log.includes("You are back in the trick."), label);
    assert.ok(s.log.includes("Bomb penalty: Mina pays 1 to You — her 2 was bombed."), label);
    assertNoDeadTurnOffered(emitted);
  }
});

test("controller: seed 38 replay — the live four-4s comeback still stops and offers the bomb (TASK 038)", () => {
  const rng = seededRng(38);
  const { controller, emitted } = recordEmits(() => newDeal(rng));
  controller.newMatch();
  const s = controller.state;
  assert.equal(controller.humanPass(), true); // pass once, as the audit's replay did
  assert.equal(s.trick!.currentPlayer, 0, "the turn stops on your comeback");
  assert.ok(s.trick!.passed.includes(0));
  assert.deepEqual(s.trick!.currentPlay!.cards.map((card) => card.id), ["2-spades"]);
  assert.equal(s.log[s.log.length - 1], "Rosa plays single 2♠.");
  const fours = ["4-clubs", "4-diamonds", "4-hearts", "4-spades"];
  assert.deepEqual(ids(cardsOf(controller.hint()!)), fours, "Hint offers four 4s");
  assert.equal(controller.humanPlay(cardsOf(controller.hint()!)), true);
  assert.ok(s.log.includes("You are back in the trick."));
  assert.ok(s.log.includes("Bomb penalty: Rosa pays 1 to You — her 2 was bombed."));
  assertNoDeadTurnOffered(emitted);
});

test("controller: seeded autopilot matches never offer a dead turn; live comebacks still stop (TASK 038)", () => {
  let humanLive = 0;
  let cpuLive = 0;
  for (const seed of SEEDED_LIVE_SEEDS) {
    const rng = seededRng(seed);
    const { controller, emitted } = recordEmits(() => newDeal(rng));
    controller.newMatch();
    const s = controller.state;
    for (let steps = 0; s.phase !== "matchEnd"; steps++) {
      assert.ok(steps < 20000, "match did not finish");
      if (s.phase === "roundEnd") {
        controller.continueRound();
        continue;
      }
      if (hasLiveComebackTurn(s.trick!, 0)) humanLive++;
      const action = controller.hint()!;
      assert.ok(action.type === "pass" ? controller.humanPass() : controller.humanPlay(action.cards));
    }
    // With a synchronous schedule every CPU turn is emitted before
    // the CPU acts, so a live CPU comeback shows up here.
    cpuLive += emitted.filter((st) => st.phase === "playing" && st.trick !== null &&
      st.trick.currentPlayer !== 0 && hasLiveComebackTurn(st.trick, st.trick.currentPlayer)).length;
    assertNoDeadTurnOffered(emitted);
  }
  assert.ok(humanLive > 0, "a live human comeback still stops for you");
  assert.ok(cpuLive > 0, "live CPU comebacks still happen");
});

// ---------- TASK 041: copy bundle (audit #5 + #7) ----------

test("model: one conjugation helper — the human seat is second person, CPU seats third (TASK 041)", () => {
  assert.equal(conjugate(0, "play", "plays"), "play");
  for (const cpu of [1, 2, 3]) assert.equal(conjugate(cpu, "play", "plays"), "plays");
  assert.equal(seatVerb(0, "were", "was"), "You were");
  assert.equal(seatVerb(1, "were", "was"), "Mina was");
  assert.equal(seatVerb(2, "take", "takes"), "Kenji takes");
  assert.equal(seatVerb(3, "lead", "leads"), "Rosa leads");
  // The pre-existing human-seat lines run through the same helper and
  // read exactly as before.
  assert.equal(comebackLogLine(0), "You are back in the trick.");
  assert.equal(comebackLogLine(2), "Kenji is back in the trick.");
  assert.equal(bombPenaltyLogLine({ payer: 0, payee: 1, points: 1 }), "Bomb penalty: You pay 1 to Mina — your 2 was bombed.");
  assert.equal(bombedBombLogLine({ payer: 3, payee: 0, points: 1 }), "Bomb penalty: Rosa pays 1 to You — her bomb was bombed.");
});

test("controller: human-seat log lines conjugate — You lead / play / pass / take it; CPU lines unchanged (TASK 041)", () => {
  // You hold the 3♠ (you lead round 1) and go out first; Mina, Kenji
  // and Rosa answer in turn.
  const hands = [
    [c("3", "spades"), c("9", "hearts")],
    [c("4", "clubs"), c("K", "spades"), c("5", "clubs")],
    [c("6", "clubs"), c("A", "spades"), c("7", "clubs")],
    [c("8", "clubs"), c("2", "spades"), c("10", "clubs")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  assert.equal(s.log[1], "Round 1: You lead.");
  assert.equal(controller.humanPlay([c("3", "spades")]), true);
  assert.equal(s.log[2], "You play single 3♠.");
  assert.equal(s.log[3], "Mina plays single 4♣.");
  assert.equal(s.log[4], "Kenji plays single 6♣.");
  assert.equal(s.log[5], "Rosa plays single 8♣.");
  // You pass while the trick is live: locked out.
  assert.equal(controller.humanPass(), true);
  assert.ok(s.log.includes("You pass — locked out."), s.log.join(" | "));
  assert.ok(!s.log.some((line) => /^You (plays|passes|leads|takes)\b/.test(line)), s.log.join(" | "));

  // A round you win: You take it.
  const winHands = [
    [c("3", "spades")],
    [c("4", "clubs"), c("5", "clubs")],
    [c("6", "clubs"), c("7", "clubs")],
    [c("8", "clubs"), c("9", "clubs")],
  ];
  const won = createController({ schedule: sync, dealHands: () => winHands });
  won.newMatch();
  // You go out on your only card; the CPU seats play the round down.
  assert.equal(won.humanPlay([c("3", "spades")]), true);
  assert.equal(won.state.phase, "roundEnd");
  assert.equal(won.state.roundSummary?.finishOrder[0], 0);
  assert.ok(won.state.log.includes("Round over. You take it."), won.state.log.join(" | "));
});

test("controller: an instant win by the human seat logs \"You win round 1 instantly…\" (TASK 041)", () => {
  // Four 2s for you; the first seed whose CPU hands hold no instant
  // win of their own.
  const twos = createDeck().filter((card) => card.rank === "2");
  let hands: Card[][] = [];
  for (let seed = 41; seed < 500; seed++) {
    const rest = shuffle(createDeck().filter((card) => card.rank !== "2"), seededRng(seed));
    hands = [[...twos, ...rest.slice(0, 9)], rest.slice(9, 22), rest.slice(22, 35), rest.slice(35, 48)];
    if (hands.slice(1).every((hand) => detectInstantWin(hand) === null)) break;
  }
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  assert.equal(s.roundSummary?.instantWin?.winner, 0, "you hold four 2s");
  assert.match(s.log[1], /^You win round 1 instantly with /);
});

test("controller: an instant-win summary captures the dealt winning hand for the beat (TASK 043)", () => {
  // Same scripted four-2s deal as the TASK 041 log test above.
  const twos = createDeck().filter((card) => card.rank === "2");
  let hands: Card[][] = [];
  for (let seed = 41; seed < 500; seed++) {
    const rest = shuffle(createDeck().filter((card) => card.rank !== "2"), seededRng(seed));
    hands = [[...twos, ...rest.slice(0, 9)], rest.slice(9, 22), rest.slice(22, 35), rest.slice(35, 48)];
    if (hands.slice(1).every((hand) => detectInstantWin(hand) === null)) break;
  }
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const iw = controller.state.roundSummary?.instantWin;
  assert.ok(iw, "the round is an instant win");
  assert.equal(iw.hand.length, 13, "the full dealt hand is captured");
  assert.deepEqual(
    iw.hand, sortHand(hands[0]),
    "the captured hand is the winner's dealt hand, in display order",
  );
  assert.ok(
    iw.hand.filter((card) => card.rank === "2").length === 4,
    "all four 2s are in it",
  );
});

// ---------- TASK 044: Fast mode + skip to the end of the round ----------

// Drive a full seeded match on a hand-fired timer queue: the
// human seat plays the hint's action, CPU turns fire one timer
// at a time, and every armed delay is recorded against the
// action the turn is due to take. In "skip" mode the driver
// calls skipToRoundEnd() at every opportunity instead of firing
// the round's remaining timers.
function driveMatch044(
  seed: number,
  mode: "normal" | "fast" | "skip",
): {
  log: string[];
  scores: number[];
  winner: number | null;
  delays: { ms: number; type: Action["type"] }[];
  skips: number;
} {
  const queue: { fn: () => void; ms: number }[] = [];
  const rng = seededRng(seed);
  const controller = createController({
    schedule: (fn, ms) => {
      queue.push({ fn, ms });
    },
    dealHands: () => newDeal(rng),
  });
  if (mode === "fast") controller.setSpeed("fast");
  const delays: { ms: number; type: Action["type"] }[] = [];
  let skips = 0;
  controller.newMatch();
  for (let guard = 0; guard < 20000; guard++) {
    const st = controller.state;
    if (st.phase === "matchEnd") {
      return {
        log: [...st.log],
        scores: [...(st.match?.scores ?? [])],
        winner: st.match?.winner ?? null,
        delays,
        skips,
      };
    }
    if (st.phase === "roundEnd") {
      controller.continueRound();
      continue;
    }
    if (
      mode === "skip" &&
      st.trick &&
      !st.trick.roundOver &&
      st.trick.finishOrder.includes(0)
    ) {
      skips++;
      controller.skipToRoundEnd();
      continue;
    }
    if (st.trick && st.trick.currentPlayer === 0) {
      const a = controller.hint();
      if (a && a.type === "play") controller.humanPlay(a.cards);
      else controller.humanPass();
      continue;
    }
    const next = queue.shift();
    assert.ok(next, "a CPU timer is armed while a CPU turn is due");
    const due = controller.state.trick;
    assert.ok(due, "a trick is live while a CPU turn is due");
    delays.push({ ms: next.ms, type: chooseAction(due, due.currentPlayer).type });
    next.fn();
  }
  throw new Error("the driven match never ended");
}

test("controller: Fast shortens CPU delays (passes quicker than plays); Normal keeps 650 for both; decisions identical (TASK 044)", () => {
  const normal = driveMatch044(7, "normal");
  assert.ok(normal.delays.length > 0, "CPU turns were scheduled");
  assert.ok(
    normal.delays.every((d) => d.ms === 650),
    "Normal arms every CPU turn at the original 650 ms, plays and passes alike",
  );
  const fast = driveMatch044(7, "fast");
  assert.equal(fast.delays.length, normal.delays.length, "the same CPU turns are taken");
  assert.deepEqual(
    fast.delays.map((d) => d.type),
    normal.delays.map((d) => d.type),
    "the same sequence of plays and passes",
  );
  for (const d of fast.delays) {
    assert.equal(d.ms, d.type === "pass" ? 100 : 250, `Fast ${d.type} delay`);
  }
  assert.ok(fast.delays.some((d) => d.type === "pass"), "the match contains CPU passes");
  assert.ok(fast.delays.some((d) => d.type === "play"), "the match contains CPU plays");
  assert.deepEqual(fast.log, normal.log, "identical log at either speed");
  assert.deepEqual(fast.scores, normal.scores, "identical final scores");
  assert.equal(fast.winner, normal.winner, "identical match winner");
});

test("controller: skip to end of round lands exactly the played-out round (TASK 044)", () => {
  const played = driveMatch044(1, "normal");
  const skipped = driveMatch044(1, "skip");
  assert.ok(skipped.skips > 0, "skip opportunities arose and were taken");
  assert.deepEqual(skipped.log, played.log, "identical log with skip used at every opportunity");
  assert.deepEqual(skipped.scores, played.scores, "identical final scores");
  assert.equal(skipped.winner, played.winner, "identical match winner");
});

test("controller: skip is a no-op until the human has finished the round; speed starts at Normal (TASK 044)", () => {
  const queue: { fn: () => void; ms: number }[] = [];
  const rng = seededRng(3);
  const controller = createController({
    schedule: (fn, ms) => {
      queue.push({ fn, ms });
    },
    dealHands: () => newDeal(rng),
  });
  assert.equal(controller.speed(), "normal", "a fresh controller paces at Normal");
  controller.setSpeed("fast");
  assert.equal(controller.speed(), "fast");
  controller.setSpeed("normal");
  assert.equal(controller.speed(), "normal");
  controller.skipToRoundEnd();
  assert.equal(controller.state.phase, "idle", "skip at idle does nothing");
  controller.newMatch();
  const logBefore = controller.state.log.length;
  const playerBefore = controller.state.trick?.currentPlayer;
  controller.skipToRoundEnd();
  assert.equal(controller.state.phase, "playing", "nobody has finished: the round plays on");
  assert.equal(controller.state.log.length, logBefore, "no action was taken");
  assert.equal(controller.state.trick?.currentPlayer, playerBefore, "the same turn stands");
});

// The engine's own strings, read off real rejections — so the mapping
// can never silently drift from what the engine throws.
const thrown = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return assert.fail("expected the engine to reject");
};

test("model: the mapped engine strings are exactly what the engine throws (TASK 041)", () => {
  const onTable = (cards: Card[]) => actingState(
    [c("4", "spades"), c("4", "clubs"), c("5", "spades"), c("5", "clubs"), c("6", "spades"), c("6", "clubs"), c("3", "hearts")],
    { player: 3, cards, type: "single" },
  );
  assert.equal(thrown(() => playCards(onTable([c("9", "hearts")]), 0, [c("3", "hearts")])), ENGINE_ERRORS.doesNotBeat);
  const lead = actingState([c("4", "spades"), c("4", "clubs"), c("5", "spades"), c("5", "clubs"), c("6", "spades"), c("6", "clubs")]);
  assert.equal(thrown(() => playCards(lead, 0, [...lead.hands[0]])), ENGINE_ERRORS.bombLead);
  assert.equal(thrown(() => passTurn(lead, 0)), ENGINE_ERRORS.leaderPass);
  assert.equal(thrown(() => playCards(lead, 0, [c("4", "spades"), c("6", "clubs")])), ENGINE_ERRORS.notACombination);
  const opening = createTrickState([
    [c("3", "spades"), c("K", "hearts")], [c("4", "spades")], [c("5", "spades")], [c("6", "spades")],
  ]);
  assert.equal(thrown(() => playCards(opening, 0, [c("K", "hearts")])), ENGINE_ERRORS.openingLead);
  // Comeback: seat 0 passed, then a 2 landed; a 3-pair run cannot
  // bring it back.
  const hands: Card[][] = [
    [c("4", "spades"), c("4", "clubs"), c("5", "spades"), c("5", "clubs"), c("6", "spades"), c("6", "clubs"), c("K", "hearts")],
    [c("2", "hearts"), c("9", "clubs")],
    [c("J", "clubs"), c("Q", "clubs")],
    [c("3", "clubs"), c("8", "clubs")],
  ];
  const cb = createTrickState(hands, { leader: 3, openingLead: false });
  playCards(cb, 3, [c("3", "clubs")]);
  passTurn(cb, 0);
  playCards(cb, 1, [c("2", "hearts")]);
  passTurn(cb, 2);
  passTurn(cb, 3);
  assert.equal(cb.currentPlayer, 0, "seat 0's comeback turn");
  assert.equal(thrown(() => playCards(cb, 0, hands[0].slice(0, 6))), ENGINE_ERRORS.comeback);
  assert.equal(errOf(validateSelection(lead, 0, [])), NO_SELECTION);
});

test("model: rejection copy names the table and says what beats it — full stops throughout (TASK 041)", () => {
  const at = (cards: Card[]) => actingState([c("3", "hearts")], { player: 3, cards, type: "single" });
  const beat = (cards: Card[]) => playerErrorText(ENGINE_ERRORS.doesNotBeat, at(cards));
  // The audit's own example.
  assert.equal(beat([c("3", "spades")]), "Beat single 3♠ with a higher single — or Pass.");
  assert.equal(beat([c("K", "spades"), c("K", "diamonds")]), "Beat a pair, high card K♦, with a higher pair — or Pass.");
  assert.equal(beat([c("7", "spades"), c("7", "clubs"), c("7", "hearts")]), "Beat a triple, high card 7♥, with a higher triple — or Pass.");
  assert.equal(
    beat([c("5", "spades"), c("6", "clubs"), c("7", "hearts"), c("8", "spades"), c("9", "diamonds")]),
    "Beat a 5-card straight, high card 9♦, with a higher 5-card straight — or Pass.",
  );
  // 2s: the bombs that answer them, per the locked ladder.
  assert.equal(beat([c("2", "spades")]), "Beat single 2♠ with a higher single or a bomb — or Pass.");
  assert.equal(
    beat([c("2", "spades"), c("2", "clubs")]),
    "Beat a pair, high card 2♣, with a higher pair, four of a kind, or a 4-pair double run — or Pass.",
  );
  assert.equal(beat([c("2", "spades"), c("2", "clubs"), c("2", "hearts")]), "Nothing beats triple 2s — Pass.");
  // Bombs on the table: what answers each.
  assert.equal(
    beat([c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts")]),
    "Beat four of a kind, high card 9♥, with a higher four of a kind or a 4-pair double run — or Pass.",
  );
  assert.equal(
    beat([c("4", "spades"), c("4", "clubs"), c("5", "spades"), c("5", "clubs"), c("6", "spades"), c("6", "clubs")]),
    "Beat a 3-pair double run, high card 6♣, with a higher 3-pair double run or a 4-pair double run — or Pass.",
  );
  assert.equal(
    beat([c("4", "spades"), c("4", "clubs"), c("5", "spades"), c("5", "clubs"), c("6", "spades"), c("6", "clubs"), c("7", "spades"), c("7", "clubs")]),
    "Beat a 4-pair double run, high card 7♣, with a higher 4-pair double run — or Pass.",
  );
  const lead = actingState([c("3", "hearts")]);
  assert.equal(
    playerErrorText(ENGINE_ERRORS.bombLead, lead),
    "A double run can't lead — it plays only as a bomb. Lead a single, pair, triple, straight, or four of a kind.",
  );
  assert.equal(
    playerErrorText(ENGINE_ERRORS.comeback, at([c("2", "hearts")])),
    "You passed this trick, so only four of a kind or a 4-pair double run that beats single 2♥ brings you back — or Pass.",
  );
  assert.equal(
    playerErrorText(ENGINE_ERRORS.comeback, at([c("2", "spades"), c("2", "hearts")])),
    "You passed this trick, so only four of a kind or a 4-pair double run that beats a pair, high card 2♥, brings you back — or Pass.",
  );
  assert.equal(playerErrorText(ENGINE_ERRORS.openingLead, lead), "The first play of the match must include the 3♠.");
  assert.equal(playerErrorText(ENGINE_ERRORS.leaderPass, lead), "You lead this trick, so you can't pass — play any set.");
  assert.equal(
    playerErrorText(ENGINE_ERRORS.notACombination, lead),
    "Those cards don't make a set. Play a single, pair, triple, straight, or four of a kind — or a double run as a bomb.",
  );
  assert.equal(playerErrorText(NO_SELECTION, lead), "Select at least one card first — tap cards in your hand, then Play.");
  assert.equal(playerErrorText(NO_SELECTION, at([c("3", "spades")])), "Select at least one card first — or Pass.");
  // Every mapped line ends in a full stop.
  for (const raw of [...Object.values(ENGINE_ERRORS), NO_SELECTION]) {
    for (const state of [lead, at([c("3", "spades")])]) {
      const text = playerErrorText(raw, state);
      if (text !== raw) assert.match(text, /\.$/, `full stop: ${text}`);
    }
  }
});

test("model: an unmapped rejection falls back to its own text, verbatim (TASK 041)", () => {
  const lead = actingState([c("3", "hearts")]);
  for (const raw of ["Player 0 already passed this trick", "Not player 0's turn", "Something new", "It is not your turn.", "Those cards are not in your hand.", ""]) {
    assert.equal(playerErrorText(raw, lead), raw);
    assert.equal(playerErrorText(raw, null), raw);
  }
  // A table-naming line with no table to name keeps the engine text.
  assert.equal(playerErrorText(ENGINE_ERRORS.doesNotBeat, null), ENGINE_ERRORS.doesNotBeat);
  assert.equal(playerErrorText(ENGINE_ERRORS.doesNotBeat, lead), ENGINE_ERRORS.doesNotBeat);
});

test("controller: rejections show mapped copy in the error tone; hints are hints; a legal move clears it; unmapped falls back (TASK 041)", () => {
  const hands = [
    [c("4", "hearts"), c("9", "hearts"), c("6", "clubs"), c("7", "diamonds")],
    [c("3", "spades"), c("K", "spades"), c("5", "clubs")],
    [c("J", "clubs"), c("A", "spades"), c("8", "clubs")],
    [c("10", "clubs"), c("2", "spades"), c("Q", "clubs")],
  ];
  const controller = createController({ schedule: sync, dealHands: () => hands });
  controller.newMatch();
  const s = controller.state;
  // Mina led 3♠, Kenji 8♣, Rosa 10♣ — your turn against the 10♣.
  assert.equal(s.trick!.currentPlayer, 0);
  assert.equal(s.messageTone, "");
  const trickBefore = JSON.stringify(s.trick);
  const logBefore = [...s.log];
  assert.equal(controller.humanPlay([c("4", "hearts")]), false);
  assert.equal(s.message, "Beat single 10♣ with a higher single — or Pass.");
  assert.equal(s.messageTone, "error");
  assert.equal(controller.humanPlay([]), false);
  assert.equal(s.message, "Select at least one card first — or Pass.");
  assert.equal(s.messageTone, "error");
  assert.equal(JSON.stringify(s.trick), trickBefore, "rejections change nothing");
  assert.deepEqual(s.log, logBefore);
  controller.setMessage("Hint: pass — nothing beats it.", "hint");
  assert.equal(s.messageTone, "hint");
  // Unmapped engine error: you are (artificially) already a passer
  // with no comeback chance — the engine's own words come through.
  s.trick!.passed.push(0);
  assert.equal(controller.humanPass(), false);
  assert.equal(s.message, "Player 0 already passed this trick");
  assert.equal(s.messageTone, "error");
  s.trick!.passed.pop();
  // A legal move clears the line and its tone.
  assert.equal(controller.humanPass(), true);
  assert.equal(s.message, "");
  assert.equal(s.messageTone, "");
});

test("controller: seeded equivalence — the error-copy path changes no play, score or outcome (TASK 041)", () => {
  // Two autopilot matches from the same seed; in B every human turn
  // first draws two rejections (empty selection, a non-set), so the
  // new copy and error tone are exercised all match long. The game
  // record — every emitted state minus its message line — is
  // identical, and so are the final log, scores and winner.
  const run = (withRejections: boolean) => {
    const rng = seededRng(4141);
    const record: string[] = [];
    const controller = createController({
      schedule: sync,
      dealHands: () => newDeal(rng),
      onChange: (st) => {
        const game = JSON.stringify({
          phase: st.phase, scores: st.match?.scores, round: st.match?.roundNumber,
          trick: st.trick, summary: st.roundSummary, roundId: st.roundId, trickId: st.trickId, log: st.log,
        });
        if (record[record.length - 1] !== game) record.push(game);
      },
    });
    controller.newMatch();
    const s = controller.state;
    let rejected = 0;
    for (let steps = 0; s.phase !== "matchEnd"; steps++) {
      assert.ok(steps < 20000, "match did not finish");
      if (s.phase === "roundEnd") {
        controller.continueRound();
        continue;
      }
      if (withRejections) {
        assert.equal(controller.humanPlay([]), false);
        const hand = s.trick!.hands[0];
        const lowHigh = [hand[0], hand[hand.length - 1]];
        if (hand.length >= 2 && hand[0].rank !== hand[hand.length - 1].rank) {
          assert.equal(controller.humanPlay(lowHigh), false);
          assert.equal(s.messageTone, "error");
          rejected++;
        }
      }
      const action = controller.hint()!;
      assert.ok(action.type === "pass" ? controller.humanPass() : controller.humanPlay(action.cards));
    }
    return { record, log: [...s.log], scores: [...s.match!.scores], winner: s.match!.winner, rejected };
  };
  const a = run(false);
  const b = run(true);
  assert.ok(b.rejected > 10, "the error path was exercised");
  assert.deepEqual(b.record, a.record);
  assert.deepEqual(b.log, a.log);
  assert.deepEqual(b.scores, a.scores);
  assert.equal(b.winner, a.winner);
});

// ---------- TASK 042 (audit #4): banner bomb-penalty note rows ----------

test("model: bombPenaltyNet — a seat's net over both penalty kinds, paid and received (TASK 042)", () => {
  // No penalties: every seat nets zero.
  for (const p of [0, 1, 2, 3]) assert.equal(bombPenaltyNet([], p), 0);
  // The seed-164 round-5 ledger (a bombed 2, then a bomb bombed, then
  // that bomb bombed back): You receive 1, pay 1, receive 1.
  const ledger = [
    { payer: 3, payee: 0, points: 1 }, // Rosa's 2 bombed by You
    { payer: 0, payee: 1, points: 1 }, // your bomb bombed by Mina
    { payer: 1, payee: 0, points: 1 }, // Mina's bomb bombed by You
  ];
  assert.deepEqual([0, 1, 2, 3].map((p) => bombPenaltyNet(ledger, p)), [1, 0, 0, -1]);
  // A pair of 2s pays 2; nets are zero-sum across the table.
  const pair = [
    { payer: 2, payee: 3, points: 2 },
    { payer: 3, payee: 1, points: 1 },
  ];
  const nets = [0, 1, 2, 3].map((p) => bombPenaltyNet(pair, p));
  assert.deepEqual(nets, [0, 1, -2, 1]);
  assert.equal(nets.reduce((a, b) => a + b, 0), 0);
});

test("model: bombPenaltyNoteLine — 'Bomb penalty' copy, signed amount, per-seat possessive, none for zero (TASK 042)", () => {
  assert.equal(bombPenaltyNoteLine(0, 1), "Bomb penalty: +1 — mid-round, already in your total.");
  assert.equal(bombPenaltyNoteLine(1, -1), "Bomb penalty: -1 — mid-round, already in her total.");
  assert.equal(bombPenaltyNoteLine(2, 2), "Bomb penalty: +2 — mid-round, already in his total.");
  assert.equal(bombPenaltyNoteLine(3, -2), "Bomb penalty: -2 — mid-round, already in her total.");
  for (const p of [0, 1, 2, 3]) assert.equal(bombPenaltyNoteLine(p, 0), null, "a zero net shows no note");
  for (const p of [0, 1, 2, 3]) {
    for (const net of [-3, -2, -1, 1, 2, 3]) {
      const line = bombPenaltyNoteLine(p, net) as string;
      assert.ok(line.startsWith("Bomb penalty: "), line);
      assert.ok(!/chop/i.test(line), `no chop vocabulary: ${line}`);
      // The amount parses back to the net (the banner's reconciliation reads it).
      assert.equal(Number(/^Bomb penalty: ([+-]\d+) /.exec(line)?.[1]), net);
    }
  }
});
