import { createController } from "./ui/controller.js";
import {
  SEAT_NAMES,
  HUMAN,
  cardLabel,
  sortHand,
  describePlay,
  roundResultRows,
  scoreRows,
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
};

const selected = new Set(); // card ids the player has tapped

const controller = createController({ onChange: render });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function miniCard(card) {
  const label = cardLabel(card);
  return el("span", `mini-card ${label.color}`, label.text);
}

function renderSeat(player, state) {
  const box = els.seats[player];
  box.textContent = "";
  const active =
    state.phase === "playing" && state.trick && state.trick.currentPlayer === player;
  box.classList.toggle("active", Boolean(active));
  box.append(el("div", "seat-name", SEAT_NAMES[player]));
  const count = state.trick ? state.trick.hands[player].length : 0;
  const countLine = el("div", "seat-count");
  const backs = el("span", "backs");
  for (let i = 0; i < Math.min(count, 5); i++) backs.append(el("span", "back"));
  countLine.append(backs, document.createTextNode(`${count} cards`));
  box.append(countLine);
  const playBox = el("div", "seat-play");
  const entry = state.trickView.entries[player];
  if (entry?.type === "play") entry.cards.forEach((card) => playBox.append(miniCard(card)));
  else if (entry?.type === "pass") playBox.append(el("span", "pass-badge", "PASS"));
  box.append(playBox);
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
        null,
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
        null,
        `Penalty: ${SEAT_NAMES[penalty.player]} pays ${penalty.points} to ${SEAT_NAMES[penalty.paidTo]} (leftover 2s / unused bombs).`,
      ),
    );
  }
  els.continueBtn.hidden = state.phase === "matchEnd";
  els.newMatchBtn.hidden = state.phase !== "matchEnd";
}

function render(state) {
  // Score board — always visible.
  els.scores.textContent = "";
  for (const row of scoreRows(state.match ? state.match.scores : [0, 0, 0, 0])) {
    const chip = el(
      "span",
      `score-chip${row.isLeader ? " leader" : ""}${row.player === HUMAN ? " you" : ""}`,
      `${row.name} ${row.score}`,
    );
    els.scores.append(chip);
  }

  for (const player of [1, 2, 3]) renderSeat(player, state);

  const myTurn =
    state.phase === "playing" && state.trick && state.trick.currentPlayer === HUMAN;

  // Center: trick info + the play to beat.
  if (state.phase === "playing" && state.trick) {
    els.trickInfo.textContent = myTurn
      ? `Trick ${state.trick.trickNumber} — your turn`
      : `Trick ${state.trick.trickNumber} — ${SEAT_NAMES[state.trick.currentPlayer]} to play`;
    els.toBeat.textContent = "";
    if (state.trick.currentPlay) {
      els.toBeat.append(el("span", "beat-label", "To beat"));
      state.trick.currentPlay.cards.forEach((card) => els.toBeat.append(miniCard(card)));
    } else {
      els.toBeat.append(el("span", "beat-label", "New trick — anything goes"));
    }
  } else {
    els.trickInfo.textContent = state.phase === "idle" ? "Waiting to start" : "Round complete";
    els.toBeat.textContent = "";
  }
  els.message.textContent = state.message;

  // Your hand.
  els.youArea.classList.toggle("your-turn", Boolean(myTurn));
  const myHand = state.trick ? sortHand(state.trick.hands[HUMAN]) : [];
  const heldIds = new Set(myHand.map((card) => card.id));
  for (const id of [...selected]) if (!heldIds.has(id)) selected.delete(id);
  els.youHeader.textContent = state.trick
    ? `You — ${myHand.length} cards${myTurn ? " · ● your turn" : ""}`
    : "You";
  els.hand.textContent = "";
  for (const card of myHand) {
    const label = cardLabel(card);
    const btn = el("button", `card ${label.color}${selected.has(card.id) ? " selected" : ""}`);
    btn.type = "button";
    btn.disabled = !myTurn;
    btn.append(el("span", "rank", label.rank), el("span", "glyph", label.glyph));
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

  renderBanner(state);
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
els.startBtn.addEventListener("click", () => controller.newMatch());

// No auto-start: paint the idle state (start screen up, nothing dealt)
// and wait for the Start Game click.
render(controller.state);
