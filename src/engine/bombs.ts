import { rankValue, type Card, type Rank } from "./cards.js";
import { detectCombination } from "./combinations.js";
import type { PlayLike } from "./plays.js";

// Bombs for Thirteen / Tien Len (locked ladder):
// - Pair sequence of 3 consecutive pairs: bombs a single 2 only.
// - Pair sequence of 4 consecutive pairs: bombs a pair of 2s.
// - Four of a kind: bombs a single 2 or a pair of 2s.
// A bomb is the only play that can beat a 2 / pair of 2s outside the
// normal same-type rule. Five consecutive pairs is NOT a bomb
// (instant win only). Triple 2s are unbeatable: no bomb beats them.

export type BombKind = "pair-sequence-3" | "pair-sequence-4" | "four-of-a-kind";

export type Bomb =
  | { type: "bomb"; kind: "four-of-a-kind"; cards: Card[]; rank: Rank }
  | { type: "bomb"; kind: "pair-sequence-3" | "pair-sequence-4"; cards: Card[]; pairs: number };

export type BombTarget = "single-2" | "pair-of-2s" | "triple-2s";

function toCards(play: PlayLike): Card[] | null {
  if (Array.isArray(play)) return play;
  if (play && Array.isArray(play.cards)) return play.cards;
  return null;
}

function rankCounts(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

// A pair sequence: every rank appears exactly twice, ranks are
// consecutive, and no 2s take part. Returns { pairs, ranks } or null.
export function detectPairSequence(cards: PlayLike): { pairs: number; ranks: Rank[] } | null {
  const list = toCards(cards);
  if (!list || list.length < 6 || list.length % 2 !== 0) return null;
  if (list.some((card) => card.rank === "2")) return null;
  if (new Set(list.map((c) => c.id)).size !== list.length) return null;
  const counts = rankCounts(list);
  for (const n of counts.values()) if (n !== 2) return null;
  const values = [...counts.keys()].map(rankValue).sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) return null;
  }
  return { pairs: values.length, ranks: [...counts.keys()] };
}

// Returns a bomb descriptor { type: "bomb", kind, cards } or null.
// kind: "pair-sequence-3" | "pair-sequence-4" | "four-of-a-kind".
// A pair sequence of 5+ pairs is not a bomb, so it returns null.
export function detectBomb(play: PlayLike): Bomb | null {
  const cards = toCards(play);
  if (!cards || cards.length === 0) return null;
  if (new Set(cards.map((c) => c.id)).size !== cards.length) return null;

  const combo = detectCombination(cards);
  if (combo?.type === "four-of-a-kind") {
    return { type: "bomb", kind: "four-of-a-kind", cards, rank: combo.rank };
  }

  const seq = detectPairSequence(cards);
  if (seq && seq.pairs === 3) {
    return { type: "bomb", kind: "pair-sequence-3", cards, pairs: 3 };
  }
  if (seq && seq.pairs === 4) {
    return { type: "bomb", kind: "pair-sequence-4", cards, pairs: 4 };
  }
  return null;
}

export function isBomb(play: PlayLike): boolean {
  return detectBomb(play) !== null;
}

// Comeback bombs (played after passing, on the player's own turn):
// only four of a kind and the 4-pair double run qualify.
// The 3-pair double run cannot be used as a comeback bomb.
export function isComebackBomb(play: PlayLike): boolean {
  const bomb = detectBomb(play);
  return (
    bomb !== null &&
    (bomb.kind === "four-of-a-kind" || bomb.kind === "pair-sequence-4")
  );
}

// What a bomb is played against: "single-2" | "pair-of-2s" | "triple-2s" | null.
export function bombTarget(play: PlayLike): BombTarget | null {
  const cards = toCards(play);
  const combo = cards && detectCombination(cards);
  if (!combo || combo.rank !== "2") return null;
  if (combo.type === "single") return "single-2";
  if (combo.type === "pair") return "pair-of-2s";
  if (combo.type === "triple") return "triple-2s";
  return null;
}

export function bombBeats(bombPlay: PlayLike, targetPlay: PlayLike): boolean {
  const bomb = detectBomb(bombPlay);
  if (!bomb) return false;
  const target = bombTarget(targetPlay);
  if (target === "single-2") return true; // every bomb tier beats a single 2
  if (target === "pair-of-2s") {
    return bomb.kind === "pair-sequence-4" || bomb.kind === "four-of-a-kind";
  }
  return false; // triple 2s are unbeatable; bombs only target 2s
}
