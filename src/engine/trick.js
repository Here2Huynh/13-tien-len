import { detectCombination } from "./combinations.js";
import { beats } from "./plays.js";
import { detectBomb, bombBeats, bombTarget, isComebackBomb } from "./bombs.js";

// Trick / turn state machine for Thirteen / Tien Len. Engine only.
//
// Rules implemented:
// - Opening lead of a hand: the player holding 3 of spades leads, and
//   3 of spades must be included in the first play.
// - A follow play must beat the current trick play (same type, same
//   card count, higher — see plays.js), or bomb it if the current play
//   is a 2 / pair of 2s (see bombs.js).
// - Passing locks a player out for the rest of the current trick —
//   with one exception, the comeback bomb: a player who passed before
//   the current play was made gets a turn in order against a 2 / pair
//   of 2s, and may come back ONLY with four of a kind or the 4-pair
//   double run. The 3-pair double run cannot be a comeback bomb.
// - When all other active players pass, the trick clears and the player
//   who made the last play leads the next trick (any legal combination).
// - Turn order is clockwise to the next player who can still act.

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
    // Players who had already passed when the current play was made.
    // Only they can get a comeback turn against that play.
    comebackCandidates: [],
    // Comeback candidates who have already declined the current play.
    bombDecisionMade: [],
  };
}

function hasCards(state, player) {
  return state.hands[player].length > 0;
}

function isLockedOut(state, player) {
  return state.passed.includes(player);
}

// A passed player is waiting on a comeback decision when the current
// play is a bombable 2 / pair of 2s, they passed before it was played,
// and they have not declined it yet.
export function hasComebackTurn(state, player) {
  return (
    isLockedOut(state, player) &&
    state.currentPlay !== null &&
    bombTarget(state.currentPlay.cards) !== null &&
    state.comebackCandidates.includes(player) &&
    !state.bombDecisionMade.includes(player)
  );
}

function canAct(state, player) {
  if (!hasCards(state, player)) return false;
  return !isLockedOut(state, player) || hasComebackTurn(state, player);
}

// Next player clockwise from `from` (exclusive) who can still act in
// this trick. Returns -1 if there is none.
export function nextEligiblePlayer(state, from) {
  for (let step = 1; step <= 4; step++) {
    const candidate = (from + step) % 4;
    if (candidate === from) break;
    if (canAct(state, candidate)) return candidate;
  }
  return -1;
}

function clearTrick(state) {
  const winner = state.lastPlayer;
  state.currentPlay = null;
  state.passed = [];
  state.comebackCandidates = [];
  state.bombDecisionMade = [];
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
  const comeback = hasComebackTurn(state, player);
  if (isLockedOut(state, player) && !comeback) {
    throw new Error(`Player ${player} passed this trick and is locked out`);
  }
  const hand = state.hands[player];
  for (const card of cards) {
    if (!hand.some((held) => held.id === card.id)) {
      throw new Error(`Player ${player} does not hold ${card.id}`);
    }
  }
  const combo = detectCombination(cards);
  const bomb = detectBomb(cards);
  if (!combo && !bomb) throw new Error("Not a valid combination");

  if (state.currentPlay === null) {
    // Lead: any legal combination — except the opening lead of the hand
    // must include 3 of spades. A pair sequence is a bomb, not a lead:
    // it has no combination type, so it cannot be led.
    if (!combo) throw new Error("A bomb cannot be led");
    if (state.openingLead && !cards.some((card) => card.id === "3-spades")) {
      throw new Error("Opening lead must include 3 of spades");
    }
  } else if (comeback) {
    // Comeback after passing: only a comeback bomb that beats the
    // current 2 / pair of 2s. The 3-pair double run does not qualify.
    if (!isComebackBomb(cards) || !bombBeats(cards, state.currentPlay.cards)) {
      throw new Error(
        "Comeback after passing requires four of a kind or a 4-pair double run that bombs the current play",
      );
    }
  } else if (!beats(cards, state.currentPlay.cards) && !bombBeats(cards, state.currentPlay.cards)) {
    throw new Error("Play does not beat the current trick play");
  }

  state.hands[player] = hand.filter(
    (held) => !cards.some((card) => card.id === held.id),
  );
  if (comeback) {
    // Bombing back in: the player is active in this trick again.
    state.passed = state.passed.filter((p) => p !== player);
  }
  state.currentPlay = {
    player,
    cards: [...cards],
    type: combo ? combo.type : "bomb",
  };
  state.lastPlayer = player;
  state.openingLead = false;
  // A new play resets comeback chances: only players who had already
  // passed before this play can come back against it.
  state.comebackCandidates = [...state.passed];
  state.bombDecisionMade = [];

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

  if (hasComebackTurn(state, player)) {
    // Declining a comeback chance: still locked out, but the chance
    // against this play is spent.
    state.bombDecisionMade.push(player);
  } else if (isLockedOut(state, player)) {
    throw new Error(`Player ${player} already passed this trick`);
  } else {
    state.passed.push(player);
  }

  // The trick clears when every other active player has passed:
  // nobody except the player who made the last play can still act.
  const othersCanAct = [0, 1, 2, 3].some(
    (p) => p !== state.lastPlayer && canAct(state, p),
  );
  if (!othersCanAct) {
    clearTrick(state);
  } else {
    state.currentPlayer = nextEligiblePlayer(state, player);
  }
  return state;
}

export { playCards as play, passTurn as pass };
