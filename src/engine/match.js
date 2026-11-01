import { detectInstantWin } from "./instantWin.js";
import { scoreRound, scoreInstantWin } from "./scoring.js";
import { createTrickState, findOpeningLeader } from "./trick.js";
import { bombBeats } from "./bombs.js";

// Match state for Thirteen / Tien Len.
// Scores accumulate across rounds. First player to reach 13 points at
// the end of a round wins the match; if several players cross 13 in
// the same round, the highest score wins. Tiebreak for exactly equal
// top scores (flagged in the TASK 004 PR): among the tied players, the
// one who finished highest in the final round wins (for an instant-win
// round, the instant winner counts as 1st).
//
// Next round's opening leader: the previous round's winner leads.
// The 3-of-spades opening rule applies to the first round only.

export const MATCH_TARGET = 13;

export function createMatch() {
  return {
    scores: [0, 0, 0, 0],
    roundNumber: 1,
    leader: null, // leader of the next round; null before round 1
    winner: null, // match winner once decided
    history: [], // { round, deltas, winner } per completed round
  };
}

function applyDeltas(match, deltas, roundWinner, finishOrder) {
  match.scores = match.scores.map((score, p) => score + deltas[p]);
  match.history.push({ round: match.roundNumber, deltas: [...deltas], winner: roundWinner });
  match.leader = roundWinner;
  match.roundNumber += 1;

  const crossed = [0, 1, 2, 3].filter((p) => match.scores[p] >= MATCH_TARGET);
  if (crossed.length > 0) {
    const top = Math.max(...crossed.map((p) => match.scores[p]));
    const tied = crossed.filter((p) => match.scores[p] === top);
    match.winner =
      tied.length === 1
        ? tied[0]
        : tied.reduce((a, b) =>
            finishOrder.indexOf(a) <= finishOrder.indexOf(b) ? a : b,
          );
  }
  return match;
}

// Start a round on dealt hands (4 x 13).
// Instant-win hands are checked at deal: if one is found the round
// ends before any play. If more than one hand qualified (possible with
// disjoint cards), the player closest clockwise from the round's
// leader, leader first, takes it — flagged in the TASK 004 PR.
// Returns { type: "instant-win", winner, kind } or
//         { type: "play", state } with a ready trick state.
export function startRound(match, hands) {
  if (match.winner !== null) throw new Error("The match is over");
  const firstLeader =
    match.roundNumber === 1
      ? findOpeningLeader(hands)
      : (match.leader ?? findOpeningLeader(hands));
  for (let step = 0; step < 4; step++) {
    const player = (firstLeader + step) % 4;
    const win = detectInstantWin(hands[player]);
    if (win) return { type: "instant-win", winner: player, kind: win.kind };
  }
  const state =
    match.roundNumber === 1
      ? createTrickState(hands)
      : createTrickState(hands, { leader: match.leader, openingLead: false });
  return { type: "play", state };
}

// Apply an instant-win round (from startRound) to the match.
// No leftover penalties for anyone.
export function applyInstantWin(match, winner) {
  const { deltas } = scoreInstantWin(winner);
  // The instant winner counts as 1st for the tiebreak.
  const finishOrder = [winner, ...[0, 1, 2, 3].filter((p) => p !== winner)];
  applyDeltas(match, deltas, winner, finishOrder);
  return { deltas, scores: [...match.scores], matchWinner: match.winner };
}

// CHOP (John's ruling, TASK 012): when a play bombs a played 2 or
// pair of 2s, the owner of the 2s pays the bomber 1 point per 2 —
// instantly, mid-round, as a zero-sum transfer on the match scores.
// Comeback bombs chop too: any bomb-over-2s event counts, and the
// engine's bombBeats is the only definition of one (a higher 2 over
// a 2, a higher four of a kind over a four of a kind, and a bomb led
// on an empty trick are not chops). The transfer lands on
// match.scores immediately; the match winner is still decided only
// at round end (applyDeltas), so a chop never ends a match
// mid-round. A chopped 2 was played, so it is out of its owner's
// hand and can never also be charged as a round-end leftover.
// prevPlay is the trick's current play before this play ({ player,
// cards }) or null on a lead. Returns { payer, payee, points } when
// a chop happened, else null.
export function applyChop(match, prevPlay, cards, bomber) {
  if (!prevPlay || !bombBeats(cards, prevPlay.cards)) return null;
  const points = prevPlay.cards.filter((card) => card.rank === "2").length;
  if (points === 0) return null; // unreachable through bombBeats; guard anyway
  match.scores[prevPlay.player] -= points;
  match.scores[bomber] += points;
  return { payer: prevPlay.player, payee: bomber, points };
}

// Score and apply a finished round from its trick state.
// The trick state must be roundOver (see trick.js).
export function finishRound(match, state) {
  if (match.winner !== null) throw new Error("The match is over");
  if (!state.roundOver) throw new Error("The round is not finished");
  const { deltas, penalties } = scoreRound(state.finishOrder, state.hands);
  applyDeltas(match, deltas, state.finishOrder[0], state.finishOrder);
  return {
    deltas,
    penalties,
    scores: [...match.scores],
    matchWinner: match.winner,
    nextLeader: match.leader,
  };
}
