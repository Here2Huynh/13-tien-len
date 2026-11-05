import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, type Match } from "../src/engine/match.js";
import { emptyTrickView } from "../src/ui/model.js";
import type { ControllerState, Phase } from "../src/ui/controller.js";
import { persistScore, loadScoreSave, clearScoreSave } from "../src/dom/persist.js";

// TASK 039 (audit #10): the score save is written ONLY when a
// round lands. These tests drive persistScore directly with
// fabricated controller states against a fake localStorage —
// the exact layer where the defect lived: Task 031 wrote on
// every score change, so a mid-round bomb penalty that took a
// seat to 13 was written and then rejected by the parser's cap
// on reload, silently losing the match.

const SCORE_KEY = "thirteen.matchScore.v1";
const backing = new Map<string, string>();
(globalThis as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => {
    backing.set(key, String(value));
  },
  removeItem: (key: string) => {
    backing.delete(key);
  },
};

function stateWith(phase: Phase, match: Match | null): ControllerState {
  return {
    phase,
    match,
    trick: null,
    message: "",
    log: [],
    trickView: emptyTrickView(),
    roundSummary: null,
    roundId: 1,
    trickId: 1,
  };
}

// A match as the controller holds it mid-flight: scores are the
// LIVE board (bomb penalties already applied), roundNumber is
// the round in progress during play and the NEXT round once a
// round has landed (the engine advances it as the round ends).
function matchWith(scores: number[], round: number, winner: number | null = null): Match {
  const match = createMatch();
  match.scores = [...scores];
  match.roundNumber = round;
  match.winner = winner;
  return match;
}

function reset(): void {
  backing.clear();
  clearScoreSave(); // also resets the writer's dedupe memory
}

test("persist: a mid-round bomb penalty that takes a seat to 13 writes nothing — the last round-end save survives (TASK 039 audit #10)", () => {
  reset();
  // The save round 2 left behind when it landed.
  const landed = JSON.stringify({ scores: [11, -4, -3, -4], round: 3 });
  backing.set(SCORE_KEY, landed);
  // Round 3, mid-round: a bomb penalty has just moved seat 0 to
  // 13 on the live board. The match winner is still null — first
  // to 13 is only checked when the round lands.
  persistScore(stateWith("playing", matchWith([13, -5, -4, -4], 3)));
  assert.equal(
    backing.get(SCORE_KEY), landed,
    "the mid-round state was not written over the round-end save",
  );
  assert.deepEqual(
    loadScoreSave(), { scores: [11, -4, -3, -4], round: 3 },
    "a reload at this moment restores the last completed round — the match is not lost",
  );
});

test("persist: mid-round states write nothing at all when no save exists yet (TASK 039)", () => {
  reset();
  persistScore(stateWith("playing", matchWith([2, -1, 0, -1], 1)));
  persistScore(stateWith("playing", matchWith([0, 0, 0, 0], 1)));
  assert.equal(backing.has(SCORE_KEY), false, "no save appears before the first round lands");
});

test("persist: a round-end state writes the final standings and the advanced round, and the save reads back (TASK 039)", () => {
  reset();
  // Round 4 has landed: final board [5,-2,3,-6], and the engine
  // has already advanced roundNumber to the round Resume deals.
  persistScore(stateWith("roundEnd", matchWith([5, -2, 3, -6], 5)));
  assert.deepEqual(
    JSON.parse(backing.get(SCORE_KEY)!) as unknown,
    { scores: [5, -2, 3, -6], round: 5 },
    "the save holds the landed board and the next round",
  );
  assert.deepEqual(
    loadScoreSave(), { scores: [5, -2, 3, -6], round: 5 },
    "a save the game writes is a save the game accepts back",
  );
});

test("persist: idle behind the start gate leaves any save untouched (TASK 039)", () => {
  reset();
  const landed = JSON.stringify({ scores: [5, -2, 3, -6], round: 5 });
  backing.set(SCORE_KEY, landed);
  persistScore(stateWith("idle", null));
  assert.equal(backing.get(SCORE_KEY), landed);
});

test("persist: a decided match clears the save — no resumable save remains (TASK 039)", () => {
  reset();
  backing.set(SCORE_KEY, JSON.stringify({ scores: [11, -4, -3, -4], round: 3 }));
  persistScore(stateWith("matchEnd", matchWith([14, -5, -4, -5], 3, 0)));
  assert.equal(backing.has(SCORE_KEY), false, "match end removes the save");
});
