import { sortCards } from "../engine/cards.js";
import { detectCombination } from "../engine/combinations.js";
import { detectBomb } from "../engine/bombs.js";

// Pure view-model helpers for the UI. No DOM, no rule logic: display
// mapping and shallow selection checks only. Anything about whether a
// play is legal belongs to the engine; the controller surfaces the
// engine's own error when a play is rejected.

export const SEAT_NAMES = ["You", "Mina", "Kenji", "Rosa"];
export const HUMAN = 0;

const SUIT_GLYPHS = { spades: "♠", clubs: "♣", diamonds: "♦", hearts: "♥" };
const RED_SUITS = new Set(["diamonds", "hearts"]);

export function cardLabel(card) {
  return {
    rank: card.rank,
    suit: card.suit,
    glyph: SUIT_GLYPHS[card.suit],
    text: `${card.rank}${SUIT_GLYPHS[card.suit]}`,
    color: RED_SUITS.has(card.suit) ? "red" : "black",
  };
}

export function sortHand(hand) {
  return sortCards(hand);
}

// Shallow selection checks the UI can make before asking the engine.
// Returns { ok: true } or { ok: false, error }. A selection that
// passes here can still be rejected by the engine (wrong type, does
// not beat, bomb rules) — that error is shown to the player as-is.
export function validateSelection(state, player, cards) {
  if (!state || state.roundOver) return { ok: false, error: "The round is over." };
  if (state.currentPlayer !== player) return { ok: false, error: "It is not your turn." };
  if (!cards || cards.length === 0) {
    return { ok: false, error: "Select at least one card first." };
  }
  const held = new Set(state.hands[player].map((card) => card.id));
  if (cards.some((card) => !held.has(card.id))) {
    return { ok: false, error: "Those cards are not in your hand." };
  }
  return { ok: true };
}

// Per-trick presentation view: what each seat last did in the current
// trick. The engine only keeps the latest play, so the UI records the
// actions it drives. Reducer-style, pure.
export function emptyTrickView() {
  return { entries: {} }; // player -> { type: "play", cards } | { type: "pass" }
}

export function applyToTrickView(view, event) {
  const entries = { ...view.entries };
  if (event.type === "play") entries[event.player] = { type: "play", cards: event.cards };
  else if (event.type === "pass") entries[event.player] = { type: "pass" };
  return { entries };
}

// Human-readable name for a play, for the log and banners. Detection
// is the engine's; this only phrases the result.
export function describePlay(cards, wasBomb = false) {
  const bomb = detectBomb(cards);
  // Pair sequences can only ever be played as bombs, so they always
  // phrase as one. A four of a kind phrases as a bomb only when it
  // actually functioned as one (played against a single 2 / pair of
  // 2s via the bomb path, per the caller); led or played as a plain
  // combination, it phrases as a plain four of a kind.
  if (bomb && (bomb.kind !== "four-of-a-kind" || wasBomb)) {
    if (bomb.kind === "four-of-a-kind") return "a BOMB — four of a kind";
    if (bomb.kind === "pair-sequence-3") return "a BOMB — 3-pair double run";
    return "a BOMB — 4-pair double run";
  }
  const combo = detectCombination(cards);
  if (!combo) return `${cards.length} cards`;
  const top = sortCards(cards)[cards.length - 1];
  const topLabel = cardLabel(top).text;
  switch (combo.type) {
    case "single":
      return `single ${topLabel}`;
    case "pair":
      return `a pair, high card ${topLabel}`;
    case "triple":
      return `a triple, high card ${topLabel}`;
    case "four-of-a-kind":
      return `four of a kind, high card ${topLabel}`;
    case "straight":
      return `a ${cards.length}-card straight, high card ${topLabel}`;
    default:
      return `${cards.length} cards`;
  }
}

// The log line for the bomb penalty (TASK 012, John's wording): the
// moment a played 2 or pair of 2s is bombed, its owner pays the
// bomber 1 point per 2.
// "Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed."
const POSSESSIVES = ["your", "her", "his", "her"]; // by seat: You, Mina, Kenji, Rosa

export function bombPenaltyLogLine({ payer, payee, points }) {
  const what = points === 2 ? "pair of 2s" : "2";
  const pays = payer === HUMAN ? "pay" : "pays";
  return `Bomb penalty: ${SEAT_NAMES[payer]} ${pays} ${points} to ${SEAT_NAMES[payee]} — ${POSSESSIVES[payer]} ${what} was bombed.`;
}

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th"];

// Rows for the round-end banner: finish order + score deltas.
export function roundResultRows(finishOrder, deltas, names = SEAT_NAMES) {
  return finishOrder.map((player, index) => ({
    player,
    name: names[player],
    place: PLACE_LABELS[index],
    delta: deltas[player],
  }));
}

export function scoreRows(scores, names = SEAT_NAMES) {
  const best = Math.max(...scores);
  return scores.map((score, player) => ({
    player,
    name: names[player],
    score,
    isLeader: score === best && score > 0,
  }));
}
