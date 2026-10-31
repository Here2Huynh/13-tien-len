import { RANKS } from "./cards.js";
import { detectCombination } from "./combinations.js";
import { beats, highestCard } from "./plays.js";
import { detectBomb, bombBeats, bombTarget, isComebackBomb } from "./bombs.js";
import { hasComebackTurn } from "./trick.js";

// Simple rule-based CPU policy for Thirteen / Tien Len.
// Deterministic: no randomness anywhere in decisions. The exact policy:
//
// - Enumerate every legal play from the hand: singles, pairs, triples,
//   four of a kind, straights (all suit combinations), plus pair
//   sequences and four of a kinds as bombs.
// - "Lowest" play = lowest highest-card (rank, then suit), then fewest
//   cards, then card ids — a total order, so choices never tie.
// - On lead: play the lowest legal combination. Pair sequences are
//   bombs, not combinations, so they are never led. On the round-1
//   opening lead, only plays including 3 of spades are considered
//   (the engine enforces this; the AI complies by construction).
// - On follow: play the lowest play that beats the current play. If no
//   normal play beats it and the current play is a single 2 or a pair
//   of 2s, bomb it with the weakest sufficient bomb; otherwise pass.
//   (A higher-suit 2 is a normal beating play and is used as one.)
// - Weakest sufficient bomb order (the ladder order from the locked
//   rules): pair-sequence-3, then pair-sequence-4, then four of a kind;
//   within a kind, lowest highest-card first.
// - On a comeback turn (after passing): same bomb policy, restricted
//   to comeback-legal bombs (four of a kind, pair-sequence-4) exactly
//   as the engine allows; otherwise pass.

function combosOf(cards, size) {
  if (size === 1) return cards.map((card) => [card]);
  const out = [];
  const pick = (start, chosen) => {
    if (chosen.length === size) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      chosen.push(cards[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

// Each group's options are card segments: [card] for one card,
// [card, card] for a pair. The product concatenates the segments.
function cartesian(groups) {
  return groups.reduce(
    (acc, group) =>
      acc.flatMap((prefix) => group.map((segment) => [...prefix, ...segment])),
    [[]],
  );
}

function rankGroups(hand) {
  const groups = new Map();
  for (const card of hand) {
    if (!groups.has(card.rank)) groups.set(card.rank, []);
    groups.get(card.rank).push(card);
  }
  return groups;
}

const STRAIGHT_RANKS = RANKS.filter((rank) => rank !== "2");

// Every combination play in the hand: singles, pairs, triples,
// four of a kind, straights. (Pair sequences are bombs, not
// combinations — see enumerateBombs.)
export function enumeratePlays(hand) {
  const groups = rankGroups(hand);
  const plays = [];
  for (const card of hand) plays.push([card]);
  for (const cards of groups.values()) {
    if (cards.length >= 2) plays.push(...combosOf(cards, 2));
    if (cards.length >= 3) plays.push(...combosOf(cards, 3));
    if (cards.length === 4) plays.push([...cards]);
  }
  // Straights: every window of 3+ consecutive ranks, every suit choice.
  for (let start = 0; start < STRAIGHT_RANKS.length; start++) {
    for (let end = start + 2; end < STRAIGHT_RANKS.length; end++) {
      const ranks = STRAIGHT_RANKS.slice(start, end + 1);
      if (ranks.some((rank) => !groups.has(rank))) break;
      plays.push(...cartesian(ranks.map((rank) => groups.get(rank).map((card) => [card]))));
    }
  }
  return plays;
}

// Every bomb in the hand: four of a kinds, and pair sequences of
// 3 or 4 consecutive pairs (every suit choice).
export function enumerateBombs(hand) {
  const groups = rankGroups(hand);
  const bombs = [];
  for (const cards of groups.values()) {
    if (cards.length === 4) bombs.push([...cards]);
  }
  for (const length of [3, 4]) {
    for (let start = 0; start + length <= STRAIGHT_RANKS.length; start++) {
      const ranks = STRAIGHT_RANKS.slice(start, start + length);
      if (ranks.some((rank) => (groups.get(rank)?.length ?? 0) < 2)) continue;
      bombs.push(...cartesian(ranks.map((rank) => combosOf(groups.get(rank), 2))));
    }
  }
  return bombs;
}

function playKey(play) {
  return [
    highestCard(play).value,
    play.length,
    play.map((card) => card.id).sort().join(","),
  ];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

const byPlayOrder = (a, b) => compareKeys(playKey(a), playKey(b));

const BOMB_TIER = { "pair-sequence-3": 0, "pair-sequence-4": 1, "four-of-a-kind": 2 };

function bombKey(play) {
  return [BOMB_TIER[detectBomb(play).kind], ...playKey(play)];
}

const byBombOrder = (a, b) => compareKeys(bombKey(a), bombKey(b));

function weakestBomb(hand, current, { comebackOnly = false } = {}) {
  const bombs = enumerateBombs(hand)
    .filter((bomb) => bombBeats(bomb, current))
    .filter((bomb) => !comebackOnly || isComebackBomb(bomb))
    .sort(byBombOrder);
  return bombs[0] ?? null;
}

// Choose the CPU action for `player` in a trick state.
// Returns { type: "play", cards } or { type: "pass" }.
// Call only when it is the player's turn.
export function chooseAction(state, player) {
  const hand = state.hands[player];

  if (state.currentPlay === null) {
    let candidates = enumeratePlays(hand).filter((play) => detectCombination(play));
    if (state.openingLead) {
      candidates = candidates.filter((play) =>
        play.some((card) => card.id === "3-spades"),
      );
    }
    candidates.sort(byPlayOrder);
    return { type: "play", cards: candidates[0] };
  }

  const current = state.currentPlay.cards;

  if (hasComebackTurn(state, player)) {
    const bomb = weakestBomb(hand, current, { comebackOnly: true });
    return bomb ? { type: "play", cards: bomb } : { type: "pass" };
  }

  const beating = enumeratePlays(hand)
    .filter((play) => beats(play, current))
    .sort(byPlayOrder);
  if (beating.length > 0) return { type: "play", cards: beating[0] };

  if (bombTarget(current) !== null) {
    const bomb = weakestBomb(hand, current);
    if (bomb) return { type: "play", cards: bomb };
  }

  return { type: "pass" };
}
