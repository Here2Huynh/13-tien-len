import { newDeal } from "./deal.js";
import { createMatch, startRound, applyInstantWin, finishRound, applyTurn, type Chop } from "./match.js";
import { passTurn } from "./trick.js";
import { chooseAction } from "./ai.js";
import type { InstantWinKind } from "./instantWin.js";

// Headless AI-vs-AI match runner. Plays full matches through the real
// trick / scoring / match flow (no shortcuts), for tests and tooling.
// Deterministic per seed: the only randomness is the shuffle, driven
// by the seeded rng below.

export interface RoundRecord {
  deltas: number[];
  winner: number;
  instantWin: InstantWinKind | null;
}

export interface MatchResult {
  winner: number;
  scores: number[];
  rounds: RoundRecord[];
  chops: Chop[];
}

export interface PlayMatchOptions {
  maxRounds?: number;
  maxActionsPerRound?: number;
}

// mulberry32: small seeded rng, returns functions like Math.random.
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Play one full match with all four seats on the CPU policy.
// Any illegal play throws out of the engine, so a completed match is
// proof the policy only made legal plays. Bomb penalties are applied
// the moment they land — a bomb on a 2 (see match.applyChop) or a
// bomb on a bomb (see match.applyBombedBombPenalty) — and both kinds
// share the chops ledger, so final scores = sum of round deltas +
// net chops per player.
// Returns { winner, scores, rounds: [{ deltas, winner, instantWin }],
//           chops: [{ payer, payee, points }] }.
export function playMatch(seed: number, { maxRounds = 500, maxActionsPerRound = 10000 }: PlayMatchOptions = {}): MatchResult {
  const rng = seededRng(seed);
  const match = createMatch();
  const rounds: RoundRecord[] = [];
  const chops: Chop[] = [];

  while (match.winner === null) {
    if (rounds.length >= maxRounds) {
      throw new Error(`Match did not finish within ${maxRounds} rounds`);
    }
    const start = startRound(match, newDeal(rng));
    if (start.type === "instant-win") {
      const { deltas } = applyInstantWin(match, start.winner);
      rounds.push({ deltas, winner: start.winner, instantWin: start.kind });
      continue;
    }
    const state = start.state;
    let actions = 0;
    while (!state.roundOver) {
      if (++actions > maxActionsPerRound) {
        throw new Error(`Round did not finish within ${maxActionsPerRound} actions`);
      }
      const player = state.currentPlayer;
      const action = chooseAction(state, player);
      if (action.type === "play") {
        const { chop, bombedBomb } = applyTurn(match, state, player, action);
        if (chop) chops.push(chop);
        if (bombedBomb) chops.push(bombedBomb);
      } else passTurn(state, player);
    }
    const { deltas } = finishRound(match, state);
    rounds.push({ deltas, winner: state.finishOrder[0], instantWin: null });
  }

  // The loop above only exits once the match has a winner; the
  // check replaces the old `as number` cast (TASK 046).
  const winner = match.winner;
  if (winner === null) throw new Error("Match loop ended without a winner");
  return { winner, scores: [...match.scores], rounds, chops };
}
