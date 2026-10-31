import { compareCards } from "./cards.js";
import { detectCombination } from "./combinations.js";

// Play comparison for Thirteen / Tien Len.
// A play beats the current trick play only if it is the same combination
// type AND the same card count AND higher, compared by the play's highest
// card (rank first, then suit: spades low -> hearts high).
// No bombs in this module — a four of a kind is just a combination here.

// Accepts a card array, or a combination object with a `cards` array.
function toCards(play) {
  if (Array.isArray(play)) return play;
  if (play && Array.isArray(play.cards)) return play.cards;
  return null;
}

export function highestCard(play) {
  const cards = toCards(play);
  if (!cards || cards.length === 0) return null;
  return cards.reduce((a, b) => (compareCards(a, b) >= 0 ? a : b));
}

// Returns > 0 if `play` is higher than `current`, < 0 if lower, 0 if equal,
// and null if the two are not comparable (different type or card count,
// or either is not a valid combination).
export function comparePlays(play, current) {
  const playCards = toCards(play);
  const currentCards = toCards(current);
  const playCombo = playCards && detectCombination(playCards);
  const currentCombo = currentCards && detectCombination(currentCards);
  if (!playCombo || !currentCombo) return null;
  if (playCombo.type !== currentCombo.type) return null;
  if (playCards.length !== currentCards.length) return null;
  return compareCards(highestCard(playCards), highestCard(currentCards));
}

export function beats(play, current) {
  const result = comparePlays(play, current);
  return result !== null && result > 0;
}

export const canBeat = beats;
