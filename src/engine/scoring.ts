import { RANKS, type Card } from "./cards.js";

// Scoring for Thirteen / Tien Len. All transfers are zero-sum.
//
// Baseline (normal round, played all the way down to last place):
// 1st +2 (paid by last), 2nd +1 (paid by 3rd), 3rd -1, last -2.
//
// Leftover penalties, on top of baseline: 1 point per 2 left in a
// player's hand at round end, and 1 point per unused bomb still fully
// held. Each penalty point is paid to the player who finished directly
// above that player — for last place, to 1st (who locked them out).
// In a round played to last place only last still holds cards, so in
// practice penalties flow from last to 1st; the code applies the same
// recipient rule to any hand it is given.
//
// Instant win: each other player pays the winner 2 points, the round
// ends immediately, and no leftover penalties apply to anyone.

export interface Penalty {
  player: number;
  points: number;
  paidTo: number;
}

export interface ScoreResult {
  deltas: number[];
  penalties: Penalty[];
}

export interface LeftoverPenalty {
  twos: number;
  bombs: number;
  points: number;
}

// How many complete bombs (3 or 4 consecutive pairs) fit disjointly in
// a run of `length` consecutive pairs.
function sequencesInRun(length: number): number {
  if (length < 3) return 0;
  let best = 0;
  const dp: number[] = [0];
  for (let n = 1; n <= length; n++) {
    dp[n] = Math.max(
      n >= 3 ? dp[n - 3] + 1 : 0,
      n >= 4 ? dp[n - 4] + 1 : 0,
      dp[n - 1],
    );
    best = dp[n];
  }
  return best;
}

// Count unused bombs still fully held in a leftover hand.
// Application (flagged in the TASK 004 PR): bombs are counted as
// disjoint sets of cards — a four of a kind counts once and its rank
// is then not reused as pairs in a pair sequence.
export function countUnusedBombs(hand: Card[]): number {
  const counts = new Map<string, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);

  let bombs = 0;
  let run = 0;
  const closeRun = () => {
    bombs += sequencesInRun(run);
    run = 0;
  };
  for (const rank of RANKS) {
    if (rank === "2") break; // 2s never take part in pair sequences
    const n = counts.get(rank) ?? 0;
    if (n === 4) {
      bombs += 1; // four of a kind, counted on its own
      closeRun();
    } else if (n >= 2) {
      run += 1; // a pair (or the pair inside a triple) extends the run
    } else {
      closeRun();
    }
  }
  closeRun();
  // Four of a kind of 2s is a bomb too (the loop above stops before 2s).
  if ((counts.get("2") ?? 0) === 4) bombs += 1;
  return bombs;
}

// Penalty points a leftover hand owes: 1 per 2, 1 per unused bomb.
export function leftoverPenalty(hand: Card[]): LeftoverPenalty {
  const twos = hand.filter((card) => card.rank === "2").length;
  const bombs = countUnusedBombs(hand);
  return { twos, bombs, points: twos + bombs };
}

const BASELINE = [2, 1, -1, -2]; // by place: 1st, 2nd, 3rd, last

// Score a finished round.
// finishOrder: [1st, 2nd, 3rd, last] as player indexes.
// handsAtEnd: each player's cards left at round end (only last holds
// cards in a completed round).
// Returns { deltas, penalties } — deltas indexed by player, zero-sum;
// penalties lists { player, points, paidTo } for every non-zero charge.
export function scoreRound(finishOrder: number[], handsAtEnd: Card[][]): ScoreResult {
  if (
    !Array.isArray(finishOrder) ||
    finishOrder.length !== 4 ||
    new Set(finishOrder).size !== 4
  ) {
    throw new Error("scoreRound needs a finish order of all 4 players");
  }
  const deltas = [0, 0, 0, 0];
  finishOrder.forEach((player, place) => {
    deltas[player] += BASELINE[place];
  });

  const penalties: Penalty[] = [];
  finishOrder.forEach((player, place) => {
    if (place === 0) return; // 1st shed everything; no leftover possible
    const { points } = leftoverPenalty(handsAtEnd[player] ?? []);
    if (points === 0) return;
    // Paid to the player directly above — except last place pays 1st.
    const paidTo = place === 3 ? finishOrder[0] : finishOrder[place - 1];
    deltas[player] -= points;
    deltas[paidTo] += points;
    penalties.push({ player, points, paidTo });
  });

  return { deltas, penalties };
}

// Instant-win payout: winner +6, each other player -2. No penalties.
export function scoreInstantWin(winner: number): ScoreResult {
  const deltas = [0, 1, 2, 3].map((p) => (p === winner ? 6 : -2));
  return { deltas, penalties: [] };
}
