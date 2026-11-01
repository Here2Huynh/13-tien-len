import { newDeal } from "../engine/deal.js";
import { createMatch, startRound, applyInstantWin, finishRound, applyChop } from "../engine/match.js";
import { playCards, passTurn } from "../engine/trick.js";
import { chooseAction } from "../engine/ai.js";
import { detectBomb, bombTarget } from "../engine/bombs.js";
import {
  SEAT_NAMES,
  HUMAN,
  emptyTrickView,
  applyToTrickView,
  describePlay,
  bombPenaltyLogLine,
  validateSelection,
} from "./model.js";

// DOM-free game controller: owns the match flow and drives the real
// engine (match / trick / ai). The page (main.js) is a thin adapter
// that renders this state and forwards button clicks. No rule logic
// lives here — every play goes through the engine, and engine errors
// are surfaced as the message line instead of being hidden.
//
// Options:
// - onChange(state): called after every state change.
// - schedule(fn, ms): timer for CPU turns (setTimeout in the browser,
//   synchronous in tests).
// - cpuDelayMs: pause before each CPU move so play is watchable.
// - dealHands(): returns a fresh 4x13 deal (injectable for tests).

const INSTANT_WIN_NAMES = {
  "four-2s": "four 2s",
  "six-pairs": "six pairs",
  "five-consecutive-pairs": "five consecutive pairs",
  "dragon-straight": "a dragon straight",
  "three-consecutive-triples": "three consecutive triples",
};

export function createController(options = {}) {
  const onChange = options.onChange ?? (() => {});
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cpuDelayMs = options.cpuDelayMs ?? 650;
  const dealHands = options.dealHands ?? (() => newDeal(Math.random));

  const state = {
    phase: "idle", // idle | playing | roundEnd | matchEnd
    match: null,
    trick: null,
    message: "",
    log: [],
    trickView: emptyTrickView(),
    roundSummary: null,
  };

  let cpuPending = false;
  let roundChops = []; // this round's chop transfers, for the summary

  const emit = () => onChange(state);
  const name = (player) => SEAT_NAMES[player];

  function log(line) {
    state.log = [...state.log, line].slice(-60);
  }

  function startRoundInternal() {
    state.trickView = emptyTrickView();
    state.roundSummary = null;
    state.message = "";
    roundChops = [];
    const roundNo = state.match.roundNumber;
    const start = startRound(state.match, dealHands());
    if (start.type === "instant-win") {
      const { deltas } = applyInstantWin(state.match, start.winner);
      state.trick = null;
      state.roundSummary = {
        instantWin: { winner: start.winner, kind: start.kind },
        finishOrder: [start.winner],
        deltas,
        penalties: [],
        chops: [],
        scores: [...state.match.scores],
        matchWinner: state.match.winner,
      };
      state.phase = state.match.winner !== null ? "matchEnd" : "roundEnd";
      log(
        `${name(start.winner)} wins round ${roundNo} instantly with ${INSTANT_WIN_NAMES[start.kind] ?? start.kind}!`,
      );
      emit();
      return;
    }
    state.trick = start.state;
    state.phase = "playing";
    log(`Round ${roundNo}: ${name(state.trick.currentPlayer)} leads.`);
    emit();
    maybeCpu();
  }

  function applyAction(player, action) {
    const trick = state.trick;
    const trickNumberBefore = trick.trickNumber;
    const prevPlay = trick.currentPlay;
    try {
      if (action.type === "play") playCards(trick, player, action.cards);
      else passTurn(trick, player);
    } catch (error) {
      state.message = error.message;
      emit();
      return false;
    }
    state.message = "";
    // Log first: an action that clears the trick is logged like any
    // other action, even though the trick view then resets.
    if (action.type === "play") {
      // The play functioned as a bomb when it answered a single 2 /
      // pair of 2s with a bomb — that context decides the phrasing.
      const wasBomb =
        prevPlay !== null &&
        bombTarget(prevPlay.cards) !== null &&
        detectBomb(action.cards) !== null;
      log(`${name(player)} plays ${describePlay(action.cards, wasBomb)}.`);
      // Chop: bombing a played 2 / pair of 2s transfers 1 point per
      // 2 from its owner to the bomber, instantly (TASK 012). The
      // engine decides what counts (applyChop via bombBeats); the
      // transfer lands on the match scores before this emit, so the
      // score display moves on the same render.
      const chop = applyChop(state.match, prevPlay, action.cards, player);
      if (chop) {
        roundChops.push(chop);
        log(bombPenaltyLogLine(chop));
      }
    } else {
      log(`${name(player)} passes.`);
    }
    if (trick.trickNumber !== trickNumberBefore) {
      // The action cleared the trick; the new trick starts blank.
      state.trickView = emptyTrickView();
    } else if (action.type === "play") {
      state.trickView = applyToTrickView(state.trickView, {
        type: "play",
        player,
        cards: action.cards,
      });
    } else {
      state.trickView = applyToTrickView(state.trickView, { type: "pass", player });
    }
    if (trick.roundOver) {
      const result = finishRound(state.match, trick);
      state.roundSummary = {
        instantWin: null,
        finishOrder: [...trick.finishOrder],
        deltas: result.deltas,
        penalties: result.penalties,
        chops: [...roundChops],
        scores: [...state.match.scores],
        matchWinner: result.matchWinner,
      };
      state.phase = result.matchWinner !== null ? "matchEnd" : "roundEnd";
      log(`Round over. ${name(trick.finishOrder[0])} takes it.`);
      emit();
      return true;
    }
    emit();
    maybeCpu();
    return true;
  }

  function maybeCpu() {
    if (state.phase !== "playing" || !state.trick || state.trick.roundOver) return;
    const player = state.trick.currentPlayer;
    if (player === HUMAN || cpuPending) return;
    cpuPending = true;
    schedule(() => {
      cpuPending = false;
      if (state.phase !== "playing" || !state.trick) return;
      const current = state.trick.currentPlayer;
      if (current === HUMAN) return;
      applyAction(current, chooseAction(state.trick, current));
    }, cpuDelayMs);
  }

  return {
    state,
    newMatch() {
      state.match = createMatch();
      state.log = [];
      log("New match — first to 13.");
      startRoundInternal();
    },
    continueRound() {
      if (state.phase !== "roundEnd") return;
      startRoundInternal();
    },
    humanPlay(cards) {
      if (state.phase !== "playing" || !state.trick) return false;
      const check = validateSelection(state.trick, HUMAN, cards);
      if (!check.ok) {
        state.message = check.error;
        emit();
        return false;
      }
      return applyAction(HUMAN, { type: "play", cards });
    },
    humanPass() {
      if (state.phase !== "playing" || !state.trick) return false;
      return applyAction(HUMAN, { type: "pass" });
    },
    // The AI policy's suggestion for the human seat (the Hint button).
    hint() {
      if (state.phase !== "playing" || !state.trick) return null;
      if (state.trick.currentPlayer !== HUMAN) return null;
      return chooseAction(state.trick, HUMAN);
    },
    setMessage(text) {
      state.message = text;
      emit();
    },
  };
}
