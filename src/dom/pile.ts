import type { ControllerState } from "../ui/controller.js";
import type { TrickPlay } from "../engine/trick.js";
import type { Card } from "../engine/cards.js";
import { SEAT_NAMES, cardLabel, describePlay } from "../ui/model.js";
import { els, el } from "./elements.js";
import { refs } from "./fx.js";

// The center pile (TASK 036 split of main.ts): the trick header,
// the play to beat with its mini cards, and the muted "Before that"
// line. The trick state exposes only the current play, so the pile
// remembers the play it replaced, watching successive renders. The
// tracking resets when the trick clears or the round changes.

export type PlayRecord = { player: number; cards: Card[] };

/** What the fx layer reads from the pile's play tracking. */
export interface PilePlays {
  playKey: string | null;
  prevPlay: PlayRecord | null;
}

let lastPlay: PlayRecord | null = null;
let prevPlay: PlayRecord | null = null;
let lastPlayKey: string | null = null;

export function pilePlays(): PilePlays {
  return { playKey: lastPlayKey, prevPlay };
}

// A new round (TASK 036: a new roundId) forgets the previous
// round's plays.
export function resetPileRound(): void {
  lastPlay = null;
  prevPlay = null;
  lastPlayKey = null;
}

function miniCard(card: Card): HTMLElement {
  const label = cardLabel(card);
  const node = el("div", `card mini ${label.color}`);
  node.dataset.cardId = card.id;
  node.append(el("span", "r", label.rank), el("span", "s", label.glyph));
  return node;
}

// Center: the pile (play to beat) + the turn banner under it.
export function renderPile(state: ControllerState, myTurn: boolean): void {
  if (state.phase === "playing" && state.trick) {
    els.trickInfo.textContent = myTurn
      ? `Trick ${state.trick.trickNumber} — your turn`
      : `Trick ${state.trick.trickNumber} — ${SEAT_NAMES[state.trick.currentPlayer]} to play`;
    els.toBeat.textContent = "";
    if (state.trick.currentPlay) {
      const cp: TrickPlay = state.trick.currentPlay;
      const key = `${cp.player}:${cp.cards.map((c) => c.id).join(",")}`;
      if (key !== lastPlayKey) {
        prevPlay = lastPlay;
        lastPlay = { player: cp.player, cards: cp.cards };
        lastPlayKey = key;
      }
      const line = el("div", "leadline");
      const desc = el("b", null, describePlay(cp.cards));
      const by = el("b", null, SEAT_NAMES[cp.player]);
      line.append(document.createTextNode("To beat: "), desc, document.createTextNode(" · played by "), by);
      const cards = el("div", "minicards");
      refs.pileMinis = new Map();
      cp.cards.forEach((card) => {
        const mini = miniCard(card);
        refs.pileMinis.set(card.id, mini);
        cards.append(mini);
      });
      els.toBeat.append(line, cards);
      if (prevPlay) {
        // Muted via CSS (.pile .leadline.prior, opacity .65 — TASK
        // 036 moved it out of an inline style, value-identical).
        const before = el(
          "div",
          "leadline prior",
          `Before that: ${SEAT_NAMES[prevPlay.player]} — ${describePlay(prevPlay.cards)}`,
        );
        els.toBeat.append(before);
      }
    } else {
      lastPlay = null;
      prevPlay = null;
      lastPlayKey = null;
      refs.pileMinis = new Map();
      els.toBeat.append(el("div", "empty", "New trick — anything goes"));
    }
  } else {
    els.trickInfo.textContent = state.phase === "idle" ? "Waiting to start" : "Round complete";
    els.toBeat.textContent = "";
    refs.pileMinis = new Map();
    els.toBeat.append(
      el("div", "empty", state.phase === "idle" ? "Waiting to start" : "Round over"),
    );
  }
}
