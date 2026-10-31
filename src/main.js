import { createController } from "./ui/controller.js";
import { enumerateBombs } from "./engine/ai.js";
import { isComebackBomb, bombBeats } from "./engine/bombs.js";
import { hasComebackTurn } from "./engine/trick.js";
import {
  SEAT_NAMES,
  HUMAN,
  cardLabel,
  sortHand,
  describePlay,
  roundResultRows,
} from "./ui/model.js";

// Thin DOM adapter over the game controller. All flow and rules live
// in the controller/engine; this file only renders state and forwards
// clicks.

const $ = (id) => document.getElementById(id);
const els = {
  scores: $("scores"),
  seats: { 1: $("seat-1"), 2: $("seat-2"), 3: $("seat-3") },
  trickInfo: $("trick-info"),
  toBeat: $("to-beat"),
  message: $("message"),
  youArea: $("you-area"),
  youHeader: $("you-header"),
  hand: $("hand"),
  playBtn: $("play-btn"),
  passBtn: $("pass-btn"),
  hintBtn: $("hint-btn"),
  log: $("log"),
  banner: $("banner"),
  bannerTitle: $("banner-title"),
  bannerBody: $("banner-body"),
  continueBtn: $("continue-btn"),
  newMatchBtn: $("new-match-btn"),
  startScreen: $("start-screen"),
  startBtn: $("start-btn"),
  roundNum: $("round-num"),
  newMatchTop: $("new-match-top"),
  sortBtn: $("sort-btn"),
  clearBtn: $("clear-btn"),
};

const selected = new Set(); // card ids the player has tapped

// Hand display order (adapter-only): dealt ascending; the Sort button
// toggles the rendered order. The engine's hand never changes order —
// selection and play are by card id.
let sortAsc = true;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

const controller = createController({ onChange: render });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function miniCard(card) {
  const label = cardLabel(card);
  const node = el("div", `card mini ${label.color}`);
  node.append(el("span", "r", label.rank), el("span", "s", label.glyph));
  return node;
}

// Mockup seat presentation: name + cards-left count, a status line,
// and one card back per card held (side seats stack them vertically
// via CSS). Played cards live in the center pile, as in the mockup.
function renderSeat(player, state) {
  const box = els.seats[player];
  box.textContent = "";
  const trick = state.trick;
  const active =
    state.phase === "playing" && trick && trick.currentPlayer === player;
  const finishIdx = trick ? trick.finishOrder.indexOf(player) : -1;
  const count = trick ? trick.hands[player].length : 0;
  const opp = el("div", `opp${active ? " active" : ""}`);
  const who = el("div", "who");
  who.append(
    document.createTextNode(`${SEAT_NAMES[player]} · `),
    el("span", "cnt", `${count}`),
    document.createTextNode(" cards"),
  );
  opp.append(who);
  const entry = state.trickView.entries[player];
  let status = "";
  if (finishIdx >= 0) status = `Out — ${ORDINALS[finishIdx]}`;
  else if (active) status = "Thinking…";
  else if (entry?.type === "pass") status = "Passed this trick";
  opp.append(el("div", "status", status));
  const backs = el("div", "backs");
  if (finishIdx < 0) for (let i = 0; i < count; i++) backs.append(el("div", "back"));
  opp.append(backs);
  box.append(opp);
}

// Cards in the human's hand that could jump back in as a comeback
// bomb right now (passed this trick, a bombable 2 is on top, and a
// comeback-legal bomb in hand beats it) — the mockup's foil set.
// Pure engine reads; nothing here changes game state.
function comebackHotIds(state) {
  const trick = state.trick;
  if (!trick || state.phase !== "playing" || !trick.currentPlay) return new Set();
  if (!hasComebackTurn(trick, HUMAN)) return new Set();
  const hot = new Set();
  for (const bomb of enumerateBombs(trick.hands[HUMAN])) {
    if (isComebackBomb(bomb) && bombBeats(bomb, trick.currentPlay.cards)) {
      bomb.forEach((card) => hot.add(card.id));
    }
  }
  return hot;
}

function renderBanner(state) {
  const summary = state.roundSummary;
  if ((state.phase !== "roundEnd" && state.phase !== "matchEnd") || !summary) {
    els.banner.hidden = true;
    return;
  }
  els.banner.hidden = false;
  const body = els.bannerBody;
  body.textContent = "";
  if (summary.instantWin) {
    const { winner, kind } = summary.instantWin;
    els.bannerTitle.textContent =
      state.phase === "matchEnd" ? "Match over!" : "Instant win!";
    body.append(
      el(
        "p",
        "note",
        `${SEAT_NAMES[winner]} was dealt an instant-win hand (${kind.replaceAll("-", " ")}). Everyone else pays 2.`,
      ),
    );
  } else if (state.phase === "matchEnd") {
    els.bannerTitle.textContent = `🏆 ${SEAT_NAMES[summary.matchWinner]} wins the match!`;
  } else {
    els.bannerTitle.textContent = "Round over";
  }
  const table = el("table");
  const rows = summary.instantWin
    ? [0, 1, 2, 3].map((player) => ({
        player,
        name: SEAT_NAMES[player],
        place: player === summary.instantWin.winner ? "★" : "",
        delta: summary.deltas[player],
      }))
    : roundResultRows(summary.finishOrder, summary.deltas);
  for (const row of rows) {
    const tr = el("tr");
    tr.append(
      el("td", null, row.place ? `${row.place} ${row.name}` : row.name),
      el("td", null, `score ${summary.scores[row.player]}`),
    );
    const delta = el(
      "td",
      `delta ${row.delta > 0 ? "pos" : row.delta < 0 ? "neg" : ""}`,
      row.delta > 0 ? `+${row.delta}` : `${row.delta}`,
    );
    tr.append(delta);
    table.append(tr);
  }
  body.append(table);
  for (const penalty of summary.penalties) {
    body.append(
      el(
        "p",
        "note",
        `Penalty: ${SEAT_NAMES[penalty.player]} pays ${penalty.points} to ${SEAT_NAMES[penalty.paidTo]} (leftover 2s / unused bombs).`,
      ),
    );
  }
  els.continueBtn.hidden = state.phase === "matchEnd";
  els.newMatchBtn.hidden = state.phase !== "matchEnd";
}

function renderScoreboard(state) {
  els.roundNum.textContent = `${state.match ? state.match.roundNumber : 1}`;
  els.scores.textContent = "";
  const scores = state.match ? state.match.scores : [0, 0, 0, 0];
  const trick = state.trick;
  for (const player of [0, 1, 2, 3]) {
    const isTurn =
      state.phase === "playing" && trick && trick.currentPlayer === player;
    const finishIdx = trick ? trick.finishOrder.indexOf(player) : -1;
    const box = el(
      "div",
      `score${isTurn ? " turn" : ""}${finishIdx >= 0 ? " fin" : ""}`,
    );
    const nm = el("div", "nm");
    nm.append(el("span", null, SEAT_NAMES[player]));
    if (finishIdx >= 0) nm.append(el("span", "badge done", ORDINALS[finishIdx]));
    else if (trick?.currentPlay && state.trickView.entries[player]?.type === "pass")
      nm.append(el("span", "badge pass", "Passed"));
    box.append(nm);
    box.append(el("div", "pts", `${scores[player]}`));
    const meta = !trick
      ? "Not dealt yet"
      : finishIdx >= 0
        ? `Finished ${ORDINALS[finishIdx]}`
        : `${trick.hands[player].length} cards left`;
    box.append(el("div", "meta", meta));
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${Math.max(0, Math.min(100, (scores[player] / 13) * 100))}%`;
    bar.append(fill);
    box.append(bar);
    els.scores.append(box);
  }
}

function render(state) {
  // Score board — always visible.
  renderScoreboard(state);

  for (const player of [1, 2, 3]) renderSeat(player, state);

  const myTurn =
    state.phase === "playing" && state.trick && state.trick.currentPlayer === HUMAN;

  // Center: the pile (play to beat) + the turn banner under it.
  if (state.phase === "playing" && state.trick) {
    els.trickInfo.textContent = myTurn
      ? `Trick ${state.trick.trickNumber} — your turn`
      : `Trick ${state.trick.trickNumber} — ${SEAT_NAMES[state.trick.currentPlayer]} to play`;
    els.toBeat.textContent = "";
    if (state.trick.currentPlay) {
      const line = el("div", "leadline");
      const desc = el("b", null, describePlay(state.trick.currentPlay.cards));
      const by = el("b", null, SEAT_NAMES[state.trick.currentPlay.player]);
      line.append(document.createTextNode("To beat: "), desc, document.createTextNode(" · played by "), by);
      const cards = el("div", "minicards");
      state.trick.currentPlay.cards.forEach((card) => cards.append(miniCard(card)));
      els.toBeat.append(line, cards);
    } else {
      els.toBeat.append(el("div", "empty", "New trick — anything goes"));
    }
  } else {
    els.trickInfo.textContent = state.phase === "idle" ? "Waiting to start" : "Round complete";
    els.toBeat.textContent = "";
    els.toBeat.append(
      el("div", "empty", state.phase === "idle" ? "Waiting to start" : "Round over"),
    );
  }
  els.message.textContent = state.message;

  // Your hand — rendered in the current sort direction; comeback-bomb
  // cards carry the mockup's foil highlight.
  els.youArea.classList.toggle("myturn", Boolean(myTurn));
  const myHand = state.trick ? sortHand(state.trick.hands[HUMAN]) : [];
  if (!sortAsc) myHand.reverse();
  const heldIds = new Set(myHand.map((card) => card.id));
  for (const id of [...selected]) if (!heldIds.has(id)) selected.delete(id);
  els.youHeader.textContent = state.trick
    ? `You — ${myHand.length} cards${myTurn ? " · ● your turn" : ""}`
    : "You";
  const hot = comebackHotIds(state);
  els.hand.textContent = "";
  for (const card of myHand) {
    const label = cardLabel(card);
    const btn = el(
      "button",
      `card ${label.color}${selected.has(card.id) ? " sel" : ""}${hot.has(card.id) ? " bombhot" : ""}`,
    );
    btn.type = "button";
    btn.disabled = !myTurn;
    btn.append(
      el("span", "r", label.rank),
      el("span", "s", label.glyph),
      el("span", "big", label.glyph),
    );
    btn.addEventListener("click", () => {
      if (selected.has(card.id)) selected.delete(card.id);
      else selected.add(card.id);
      render(state);
    });
    els.hand.append(btn);
  }

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

  updateSortButton();

  renderBanner(state);
}

// The Sort toggle's label, title, and arrow track the current
// direction — the mockup's exact strings.
function updateSortButton() {
  els.sortBtn.setAttribute(
    "aria-label",
    sortAsc
      ? "Sort hand low to high ascending, tap to sort high to low descending"
      : "Sort hand high to low descending, tap to sort low to high ascending",
  );
  els.sortBtn.title = sortAsc
    ? "Sorted low to high (ascending) — tap to sort high to low (descending)"
    : "Sorted high to low (descending) — tap to sort low to high (ascending)";
  for (const child of els.sortBtn.children) {
    if (child.className === "sort-arrow") child.textContent = sortAsc ? "↑" : "↓";
  }
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
els.newMatchBtn.addEventListener("click", () => controller.newMatch());
els.newMatchTop.addEventListener("click", () => controller.newMatch());
els.startBtn.addEventListener("click", () => controller.newMatch());

els.sortBtn.addEventListener("click", () => {
  sortAsc = !sortAsc;
  render(controller.state);
});

els.clearBtn.addEventListener("click", () => {
  selected.clear();
  render(controller.state);
});

// No auto-start: paint the idle state (start screen up, nothing dealt)
// and wait for the Start Game click.
render(controller.state);
