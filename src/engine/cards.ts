// Core card model for Thirteen / Tien Len.
// Rank order: 3 low -> 2 high.
// Suit order: spades low -> clubs -> diamonds -> hearts high. 2 of hearts is highest.

export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;
export const SUITS = ["spades", "clubs", "diamonds", "hearts"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Orders by rank first, then suit: 3 of spades = 0, 2 of hearts = 51. */
  value: number;
  id: string;
}

export function rankValue(rank: Rank): number {
  const value = (RANKS as readonly string[]).indexOf(rank);
  if (value === -1) throw new Error(`Unknown rank: ${rank}`);
  return value;
}

export function suitValue(suit: Suit): number {
  const value = (SUITS as readonly string[]).indexOf(suit);
  if (value === -1) throw new Error(`Unknown suit: ${suit}`);
  return value;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  // value orders by rank first, then suit: 3 of spades = 0, 2 of hearts = 51.
  const value = rankValue(rank) * SUITS.length + suitValue(suit);
  return { rank, suit, value, id: `${rank}-${suit}` };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

export function compareCards(a: Card, b: Card): number {
  return a.value - b.value;
}

export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareCards);
}
