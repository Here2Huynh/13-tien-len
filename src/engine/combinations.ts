import { rankValue, type Card, type Rank } from "./cards.js";

// Detect the combinations in scope for this task only:
// single, pair, triple, four of a kind, straight.
// Returns { type, cards, rank } or null for anything else / invalid.

export type CombinationType =
  | "single"
  | "pair"
  | "triple"
  | "four-of-a-kind"
  | "straight";

export interface Combination {
  type: CombinationType;
  cards: Card[];
  rank: Rank;
}

export function detectCombination(cards: Card[]): Combination | null {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  if (new Set(cards.map((c) => c.id)).size !== cards.length) return null;

  const ranks = cards.map((c) => c.rank);
  const uniqueRanks = [...new Set(ranks)];

  if (cards.length === 1) {
    return { type: "single", cards, rank: cards[0].rank };
  }

  if (uniqueRanks.length === 1) {
    if (cards.length === 2) return { type: "pair", cards, rank: ranks[0] };
    if (cards.length === 3) return { type: "triple", cards, rank: ranks[0] };
    if (cards.length === 4) return { type: "four-of-a-kind", cards, rank: ranks[0] };
    return null;
  }

  if (isStraight(cards)) {
    const high = cards.reduce((a, b) => (rankValue(a.rank) > rankValue(b.rank) ? a : b));
    return { type: "straight", cards, rank: high.rank };
  }

  return null;
}

// Straight: 3+ cards, one of each rank, consecutive ranks, 2s NOT allowed.
export function isStraight(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  if (cards.some((c) => c.rank === "2")) return false;
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => a - b);
  if (new Set(values).size !== values.length) return false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) return false;
  }
  return true;
}
