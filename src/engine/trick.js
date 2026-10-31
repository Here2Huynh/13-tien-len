import { detectCombination } from "./combinations.js";
import { beats } from "./plays.js";

// Trick / turn state machine for Thirteen / Tien Len. Engine only.
//
// Rules implemented:
// - Opening lead of a hand: the player holding 3 of spades leads, and
//   3 of spades must be included in the first play.
// - A follow play must beat the current trick play (same type, same
//   card count, higher — see plays.js).
// - Passing locks a player out for the rest of the current trick.
// - When all other active players pass, the trick clears and the player
//   who made the last play leads the next trick (any legal combination).
// - Turn order is clockwise to the next player who has not passed this
//   trick and still holds cards.

export function findOpeningLeader(hands) {
  return hands.findIndex((hand) => hand.some((card) => card.id === "3-spades"));
}

export function createTrickState(hands) {
  if (!Array.isArray(hands) || hands.length !== 4) {
    throw new Error("Trick state needs exactly 4 hands");
  }
  const leader = findOpeningLeader(hands);
  const opening = leader !== -1;
  return {
    hands: hands.map((hand) => [...hand]),
    currentPlayer: opening ? leader : 0,
    leader: opening ? leader : 0,
    currentPlay: null, // { player, cards, type }
    lastPlayer: null,
    passed: [],
    openingLead: opening, // true until the first play of the hand is made
    trickNumber: 1,
  };
}

function hasCards(state, player) {
  return state.hands[player].length > 0;
}

function isLockedOut(state, player) {
  return state.passed.includes(player);
}

// Next player clockwise from `from` (exclusive) who has not passed this
// trick and still holds cards. Returns -1 if there is none.
export function nextEligiblePlayer(state, from) {
  for (let step = 1; step <= 4; step++) {
    const candidate = (from + step) % 4;
    if (candidate === from) break;
    if (!isLockedOut(state, candidate) && hasCards(state, candidate)) {
      return candidate;
    }
  }
  return -1;
}

function clearTrick(state) {
  const winner = state.lastPlayer;
  state.currentPlay = null;
  state.passed = [];
  state.leader = winner;
  state.trickNumber += 1;
  // Winner leads next. If the winner holds no cards, the lead moves
  // clockwise to the next player who still holds cards.
  state.currentPlayer =
    winner !== null && hasCards(state, winner)
      ? winner
      : nextEligiblePlayer(state, winner ?? 0);
  state.lastPlayer = null;
}

export function playCards(state, player, cards) {
  if (player !== state.currentPlayer) {
    throw new Error(`Not player ${player}'s turn`);
  }
  if (isLockedOut(state, player)) {
    throw new Error(`Player ${player} passed this trick and is locked out`);
  }
  const hand = state.hands[player];
  for (const card of cards) {
    if (!hand.some((held) => held.id === card.id)) {
      throw new Error(`Player ${player} does not hold ${card.id}`);
    }
  }
  const combo = detectCombination(cards);
  if (!combo) throw new Error("Not a valid combination");

  if (state.currentPlay === null) {
    // Lead: any legal combination — except the opening lead of the hand
    // must include 3 of spades.
    if (state.openingLead && !cards.some((card) => card.id === "3-spades")) {
      throw new Error("Opening lead must include 3 of spades");
    }
  } else if (!beats(cards, state.currentPlay.cards)) {
    throw new Error("Play does not beat the current trick play");
  }

  state.hands[player] = hand.filter(
    (held) => !cards.some((card) => card.id === held.id),
  );
  state.currentPlay = { player, cards: [...cards], type: combo.type };
  state.lastPlayer = player;
  state.openingLead = false;

  const next = nextEligiblePlayer(state, player);
  if (next === -1) {
    clearTrick(state);
  } else {
    state.currentPlayer = next;
  }
  return state;
}

export function passTurn(state, player) {
  if (player !== state.currentPlayer) {
    throw new Error(`Not player ${player}'s turn`);
  }
  if (state.currentPlay === null) {
    throw new Error("The trick leader must play, not pass");
  }
  if (isLockedOut(state, player)) {
    throw new Error(`Player ${player} already passed this trick`);
  }

  state.passed.push(player);

  // The trick clears when every other active player has passed:
  // nobody except the player who made the last play can still act.
  const othersCanAct = [0, 1, 2, 3].some(
    (p) =>
      p !== state.lastPlayer &&
      !isLockedOut(state, p) &&
      hasCards(state, p),
  );
  if (!othersCanAct) {
    clearTrick(state);
  } else {
    state.currentPlayer = nextEligiblePlayer(state, player);
  }
  return state;
}

export { playCards as play, passTurn as pass };
