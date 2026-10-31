import { createDeck } from "./cards.js";

// Fisher-Yates shuffle. rng is injectable so tests can be deterministic.
export function shuffle(deck, rng = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Deal a full 52-card deck to 4 players, 13 cards each, no cards left over.
export function deal(deck) {
  if (deck.length !== 52) throw new Error(`Deal needs 52 cards, got ${deck.length}`);
  const hands = [[], [], [], []];
  deck.forEach((card, index) => hands[index % 4].push(card));
  return hands;
}

export function newDeal(rng = Math.random) {
  return deal(shuffle(createDeck(), rng));
}
