import { createController, type ControllerState } from "./ui/controller.js";
import { HUMAN, describePlay, standingsText, matchInProgress } from "./ui/model.js";
import { els, el } from "./dom/elements.js";
import { beginFx, endFx } from "./dom/fx.js";
import { loadScoreSave, clearScoreSave, persistScore } from "./dom/persist.js";
import { renderScoreboard, renderSeat } from "./dom/board.js";
import { renderPile, resetPileRound, pilePlays } from "./dom/pile.js";
import {
  selected,
  setHandHost,
  resetHandRound,
  renderHand,
  updateSortButton,
  toggleSort,
} from "./dom/hand.js";
import { renderBanner, setBannerHost } from "./dom/banner.js";
import { wireMenu, menuOpen } from "./dom/menu.js";
import { holdingSchedule, openConfirm, wireConfirm } from "./dom/confirm.js";

export { stageScale } from "./dom/fx.js";

// The page's entry and composition module. Thin DOM adapter over the
// game controller: all flow and rules live in the controller/engine;
// the page only renders state and forwards clicks. TASK 036 split the
// former single-file adapter into focused modules under src/dom/ —
//   elements.ts  element table, el() factory, shared finish medal
//   fx.ts        the animation layer (TASK 014) + render element refs
//   persist.ts   score save/load (TASK 031)
//   board.ts     scoreboard + CPU seats
//   pile.ts      the center pile and its play tracking
//   hand.ts      hand rendering, selection, Sort, drag order
//   banner.ts    round/match summaries + the instant-win beat
//   menu.ts      the phone header menu (TASK 037)
//   confirm.ts   the New Match confirmation (TASK 040)
// — and this file creates the controller, owns the render pass (in
// the original order), and wires the buttons and overlays.

// The state most recently painted. Reused hand buttons (TASK 023)
// outlive the render that created them, so their click handler
// re-renders THIS — in production it is always controller.state,
// since every production render comes from the controller.
let lastRenderedState: ControllerState | null = null;

// The round the last render painted (TASK 036: the controller's
// explicit roundId — formerly "a new trick state object").
let paintedRoundId = 0;

const controller = createController({
  onChange: (state) => {
    render(state);
    persistScore(state);
  },
  // TASK 040: CPU turns that come due while the New Match
  // confirmation is up are held until it closes (a plain setTimeout
  // pass-through otherwise).
  schedule: holdingSchedule,
});

setHandHost({
  controllerState: () => controller.state,
  lastPainted: () => lastRenderedState,
  render: (state) => render(state),
});
setBannerHost({ renderCurrent: () => render(controller.state) });

export function render(state: ControllerState): void {
  lastRenderedState = state;
  const fx = beginFx(pilePlays().playKey);
  // A new roundId = a new round: the manual drag order and the
  // pile's previous-play tracking reset; the deal is ascending.
  if (state.roundId !== paintedRoundId) {
    paintedRoundId = state.roundId;
    resetHandRound();
    resetPileRound();
  }

  // Score board — always visible.
  renderScoreboard(state);

  for (const player of [1, 2, 3]) renderSeat(player, state);

  const myTurn = Boolean(
    state.phase === "playing" && state.trick && state.trick.currentPlayer === HUMAN,
  );

  // Center: the pile (play to beat) + the turn banner under it.
  renderPile(state, myTurn);
  els.message.textContent = state.message;

  renderHand(state, myTurn);

  els.playBtn.disabled = !myTurn;
  els.passBtn.disabled = !myTurn;
  els.hintBtn.disabled = !myTurn;

  // Log.
  els.log.textContent = "";
  for (const line of state.log) els.log.append(el("li", null, line));
  els.log.scrollTop = els.log.scrollHeight;

  // Start gate: the start screen covers the table until the first
  // match is started; it never comes back (New Match goes straight in).
  els.startScreen.hidden = state.phase !== "idle";
  if (state.phase === "idle") {
    // Resume signpost (TASK 039, audit #28): when a score save
    // exists, the gate offers Resume — labeled with the saved
    // round and standings — next to the start button, which then
    // reads New Match (it starts fresh and clears the save). With
    // no save the gate is exactly as it always was.
    const save = loadScoreSave();
    els.resumeBtn.hidden = save === null;
    if (save) {
      els.resumeBtn.textContent = `Resume — Round ${save.round} · ${standingsText(save.scores)}`;
    }
    els.startBtn.textContent = save ? "New Match" : "Start Game";
  }

  updateSortButton();

  renderBanner(state);

  endFx(fx, state, pilePlays());
}

els.playBtn.addEventListener("click", () => {
  const hand = controller.state.trick?.hands[HUMAN] ?? [];
  const cards = hand.filter((card) => selected.has(card.id));
  if (controller.humanPlay(cards)) selected.clear();
});

els.passBtn.addEventListener("click", () => {
  controller.humanPass();
});

els.hintBtn.addEventListener("click", () => {
  const action = controller.hint();
  if (!action) return;
  if (action.type === "pass") {
    controller.setMessage("Hint: pass — nothing beats it.");
  } else {
    selected.clear();
    action.cards.forEach((card) => selected.add(card.id));
    controller.setMessage(`Hint: play ${describePlay(action.cards)}.`);
  }
});

els.continueBtn.addEventListener("click", () => controller.continueRound());
// Every New Match entry point clears the score save first (TASK
// 039): a fresh match must never leave a stale save behind for a
// later visit to resume. Resume is the only seeded start.
function startFreshMatch(): void {
  clearScoreSave();
  controller.newMatch();
}
// Every in-play New Match entry point — the header button (which is
// also the phone ☰ menu item) and the banner's New Match — goes
// through this gate (TASK 040, audit #9): with a match in progress — mid-round or on a round
// banner — it asks first, and only a confirmed New Match wipes it
// (startFreshMatch, unchanged). With nothing to lose — no match
// yet, or the match decided (the match-over banner's New Match) —
// it is one tap, exactly as before. `from` is where focus returns
// when the dialog closes.
function requestNewMatch(from: HTMLElement): void {
  const match = controller.state.match;
  if (!match || !matchInProgress(match)) {
    startFreshMatch();
    return;
  }
  openConfirm(`Round ${match.roundNumber} · ${standingsText(match.scores)}`, from);
}
els.newMatchBtn.addEventListener("click", () => requestNewMatch(els.newMatchBtn));
// The header button is also the phone ☰ menu's item (TASK 037: the
// panel holds this same button). Its click runs before the panel
// closes the menu, so an open menu means a phone-menu tap — focus
// then returns to the ☰ button, since the item hides with its panel.
els.newMatchTop.addEventListener("click", () =>
  requestNewMatch(menuOpen() ? els.menuBtn : els.newMatchTop),
);
// The start gate's button (Start Game / New Match beside Resume,
// TASK 039) is shown only behind the idle gate, where no match is
// in progress: one tap, unchanged — it never asks.
els.startBtn.addEventListener("click", startFreshMatch);
wireConfirm(startFreshMatch);
els.resumeBtn.addEventListener("click", () => controller.newMatch(loadScoreSave() ?? undefined));

// How-to-play overlay (TASK 017): pure presentation. It never calls
// the controller and never renders, so a game in progress resumes
// exactly as it was when the overlay closes.
els.helpOverlay.hidden = true;
const setHelp = (open: boolean): void => {
  els.helpOverlay.hidden = !open;
};
els.helpTop.addEventListener("click", () => setHelp(true));
els.helpStart.addEventListener("click", () => setHelp(true));
els.helpClose.addEventListener("click", () => setHelp(false));
els.helpOverlay.addEventListener("click", (event) => {
  if (event.target === els.helpOverlay) setHelp(false);
});

// Bomb odds card (TASK 022): the same pure-presentation contract as
// the how-to-play overlay — static figures in index.html, no
// controller call, no render, no timers.
els.oddsOverlay.hidden = true;
const setOdds = (open: boolean): void => {
  els.oddsOverlay.hidden = !open;
};
els.oddsTop.addEventListener("click", () => setOdds(true));
els.oddsClose.addEventListener("click", () => setOdds(false));
els.oddsOverlay.addEventListener("click", (event) => {
  if (event.target === els.oddsOverlay) setOdds(false);
});

// Phone header menu (TASK 037): holds the three header buttons
// above at the phone breakpoint; their handlers are unchanged.
wireMenu();

els.sortBtn.addEventListener("click", () => {
  if (!controller.state.trick) return;
  toggleSort(controller.state.trick.hands[HUMAN]);
  render(controller.state);
});

els.clearBtn.addEventListener("click", () => {
  selected.clear();
  render(controller.state);
});

// No auto-start: paint the idle state (start screen up, nothing dealt)
// and wait for the Start Game click.
render(controller.state);
