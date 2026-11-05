import type { Card } from "./cards.js";
import { isComebackBomb, bombBeats, bombOnBombBeats } from "./bombs.js";
import { hasComebackTurn, type TrickState } from "./trick.js";
import { enumerateBombs } from "./ai.js";

// Live vs dead comeback turns (TASK 038). Engine only; no rule change.
//
// trick.hasComebackTurn opens a comeback turn on the table's shape
// alone (a 2 / pair of 2s / triple 2s or a bomb, against a player who
// passed before it). Whether that turn is LIVE depends on the hand:
// the player must hold at least one comeback-legal answer — a
// comeback bomb (four of a kind / 4-pair double run, per
// bombs.isComebackBomb) that beats the table via the bomb ladder
// (bombBeats) or the bomb-on-bomb ladder (bombOnBombBeats). That is
// exactly the test trick.playCards applies to a comeback play, run
// over every bomb in the hand (ai.enumerateBombs lists every four of
// a kind and every 4-pair run, every suit choice), so:
//
//   a turn is DEAD  <=>  hasComebackTurn is open and Pass is the only
//                        legal action in it.
//
// Triple 2s on the table are always dead: no bomb beats them.
// Nothing here changes what is legal in a comeback turn; the
// controller uses isDeadComebackTurn to decline dead turns for the
// player, exactly as the pass they would have to make.

/** Every comeback-legal play `player` holds right now (empty when the
    comeback gate is closed or the turn is dead). */
export function comebackAnswers(state: TrickState, player: number): Card[][] {
  if (state.currentPlay === null || !hasComebackTurn(state, player)) return [];
  const table = state.currentPlay.cards;
  return enumerateBombs(state.hands[player]).filter(
    (bomb) =>
      isComebackBomb(bomb) && (bombBeats(bomb, table) || bombOnBombBeats(bomb, table)),
  );
}

/** The comeback gate is open AND the player can actually come back. */
export function hasLiveComebackTurn(state: TrickState, player: number): boolean {
  return comebackAnswers(state, player).length > 0;
}

/** The comeback gate is open but Pass is the only legal action. */
export function isDeadComebackTurn(state: TrickState, player: number): boolean {
  return hasComebackTurn(state, player) && !hasLiveComebackTurn(state, player);
}
