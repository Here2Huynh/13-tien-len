import { RANKS, type Card, type Rank } from "./cards.js";

// Instant-win hand detection for Thirteen / Tien Len.
// Detection at deal only, on a whole 13-card hand. Payout/scoring is a
// later task — this module only says whether the hand is an instant win
// and which kind.
//
// The five hands:
// - four 2s
// - six pairs
// - five consecutive pairs
// - dragon straight 3 through A
// - three consecutive triples

export type InstantWinKind =
  | "four-2s"
  | "six-pairs"
  | "five-consecutive-pairs"
  | "dragon-straight"
  | "three-consecutive-triples";

export interface InstantWin {
  type: "instant-win";
  kind: InstantWinKind;
}

function rankCounts(hand: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

// Longest run of consecutive ranks (2s excluded) where every rank in the
// run has at least `minCount` cards. Returns the run length.
function longestRun(counts: Map<Rank, number>, minCount: number): number {
  let best = 0;
  let run = 0;
  for (const rank of RANKS) {
    if (rank === "2") break;
    if ((counts.get(rank) ?? 0) >= minCount) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

// Returns { type: "instant-win", kind } or null.
// kind: "four-2s" | "six-pairs" | "five-consecutive-pairs" |
//       "dragon-straight" | "three-consecutive-triples"
export function detectInstantWin(hand: Card[]): InstantWin | null {
  if (!Array.isArray(hand) || hand.length !== 13) return null;
  if (new Set(hand.map((c) => c.id)).size !== hand.length) return null;
  const counts = rankCounts(hand);

  if ((counts.get("2") ?? 0) === 4) {
    return { type: "instant-win", kind: "four-2s" };
  }

  // Dragon straight: one of every rank from 3 through A.
  const dragonRanks = RANKS.filter((rank) => rank !== "2");
  if (dragonRanks.every((rank) => (counts.get(rank) ?? 0) >= 1)) {
    return { type: "instant-win", kind: "dragon-straight" };
  }

  if (longestRun(counts, 3) >= 3) {
    return { type: "instant-win", kind: "three-consecutive-triples" };
  }

  if (longestRun(counts, 2) >= 5) {
    return { type: "instant-win", kind: "five-consecutive-pairs" };
  }

  // Six pairs: a four of a kind holds two pairs, so count floor(n / 2).
  let pairs = 0;
  for (const n of counts.values()) pairs += Math.floor(n / 2);
  if (pairs >= 6) {
    return { type: "instant-win", kind: "six-pairs" };
  }

  return null;
}

export function isInstantWin(hand: Card[]): boolean {
  return detectInstantWin(hand) !== null;
}
