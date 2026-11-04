import type { ControllerState } from "../ui/controller.js";
import { SEAT_NAMES } from "../ui/model.js";
import { els, el, ORDINALS, finishMedal } from "./elements.js";
import { refs, lockedInLastRender } from "./fx.js";

// The table around the pile (TASK 036 split of main.ts): the
// always-visible scoreboard and the three CPU seats.

// Mockup seat presentation: name + cards-left count, a status line,
// and one card back per card held (side seats stack them vertically
// via CSS). Played cards live in the center pile, as in the mockup.
export function renderSeat(player: number, state: ControllerState): void {
  const box = els.seats[player];
  box.textContent = "";
  const trick = state.trick;
  const active =
    state.phase === "playing" && trick && trick.currentPlayer === player;
  const finishIdx = trick ? trick.finishOrder.indexOf(player) : -1;
  const count = trick ? trick.hands[player].length : 0;
  // Lockout (TASK 014): a seat that passed this trick is greyed
  // with the LOCKED stamp until the trick clears or they come back
  // in (a comeback play removes them from `passed` in the engine).
  const lockedNow =
    state.phase === "playing" && trick !== null && trick.passed.includes(player);
  box.classList.toggle("lockedout", lockedNow);
  // Stamp once per lockout (TASK 028): the stampIn animation is
  // gated on .stampplay, carried only by the render where this
  // seat NEWLY locks — it was not in the previous render's passed
  // set for this same round (the fx trackers still hold the
  // previous render's values here; endFx advances them after).
  // Every later rebuild of the seat shows the stamp settled.
  box.classList.toggle(
    "stampplay",
    lockedNow && !lockedInLastRender(state.roundId, player),
  );
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

export function renderScoreboard(state: ControllerState): void {
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
    if (finishIdx === 0 || finishIdx === 1) {
      // Top two finish as medals, not pills (TASK 029): the
      // shared finishMedal component.
      nm.append(finishMedal(finishIdx));
    } else if (finishIdx >= 2) nm.append(el("span", "badge done", ORDINALS[finishIdx]));
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
    refs.scoreBoxes[player] = box;
  }
}
