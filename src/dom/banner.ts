import type { ControllerState, RoundSummary } from "../ui/controller.js";
import {
  SEAT_NAMES, seatVerb, penaltyLine, roundResultRows, bombPenaltyNet, bombPenaltyNoteLine,
} from "../ui/model.js";
import { els, el, finishMedal } from "./elements.js";

// Round/match summaries (TASK 036 split of main.ts): the round-over
// / match-over banner and the instant-win celebration beat that
// precedes an instant-win banner.

/** What the banner needs from the page that composes it. */
export interface BannerHost {
  /** Re-render the controller's live state (the beat's handoff). */
  renderCurrent(): void;
}

let host: BannerHost | null = null;
export function setBannerHost(h: BannerHost): void {
  host = h;
}

// ---- Instant-win celebration beat (TASK 033) -----------------------
// A dedicated full-screen beat precedes the instant-win banner: the
// table dims under the shared overlay backdrop, "INSTANT WIN!" stamps
// in over a gold burst, and the winner line names the hand. It is a
// live-transition moment only — pure adapter state, never persisted
// (a reload lands wherever the TASK 031 restore lands, beat-free),
// and it carries no exclusive information: the banner after it shows
// the full note and table exactly as before.
//
// Once-only, the TASK 028 discipline: the beat is keyed to the
// controller's explicit roundId (TASK 036 — formerly the identity of
// the roundSummary object; one round has exactly one summary). The
// first render that meets a fresh instant-win round starts the beat
// and withholds the banner; re-renders of the same round leave the
// overlay and its timer exactly as they are (no rebuild, so the CSS
// entrance never restarts, and no second timer); the handoff — timer
// or a tap anywhere on the overlay — settles the beat for that
// round, and every later render paints the banner directly.
const BEAT_MS = 2800;
let beatRoundId: number | null = null;
let beatDone = false;
let beatTimer: ReturnType<typeof setTimeout> | null = null;
let beatOverlay: HTMLElement | null = null;
let beatLine: HTMLElement | null = null;

function ensureBeatOverlay(): HTMLElement {
  if (beatOverlay) return beatOverlay;
  const overlay = el("div", "overlay iwbeat");
  const card = el("div", "iwbeat-card");
  const line = el("div", "iwbeat-line");
  card.append(el("h2", "iwbeat-title", "INSTANT WIN!"), line);
  overlay.append(card);
  overlay.hidden = true;
  overlay.addEventListener("click", () => {
    if (beatRoundId !== null) finishBeat(beatRoundId);
  });
  if (document.body) document.body.append(overlay);
  beatOverlay = overlay;
  beatLine = line;
  return overlay;
}

function startBeat(roundId: number, summary: RoundSummary): void {
  beatRoundId = roundId;
  beatDone = false;
  const { winner, kind } = summary.instantWin as {
    winner: number;
    kind: string;
  };
  const overlay = ensureBeatOverlay();
  // The winner line uses the banner note's own kind wording
  // (hyphens as spaces): "<Name> — <hand kind>".
  if (beatLine) {
    beatLine.textContent = `${SEAT_NAMES[winner]} — ${kind.replaceAll("-", " ")}`;
  }
  overlay.hidden = false;
  beatTimer = setTimeout(() => finishBeat(roundId), BEAT_MS);
}

function finishBeat(roundId: number): void {
  // Round-identity + done guards make a stale timer (one whose skip
  // already landed) and a double handoff both no-ops.
  if (beatRoundId !== roundId || beatDone) return;
  beatDone = true;
  if (beatTimer !== null) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
  if (beatOverlay) beatOverlay.hidden = true;
  host?.renderCurrent();
}

function teardownBeat(): void {
  // The banner state went away (phase moved on): the beat dies
  // with it, without a handoff render.
  if (beatTimer !== null) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
  if (beatOverlay) beatOverlay.hidden = true;
  beatRoundId = null;
  beatDone = false;
}

export function renderBanner(state: ControllerState): void {
  const summary = state.roundSummary;
  const modal = els.banner.children[0] as HTMLElement | undefined;
  if ((state.phase !== "roundEnd" && state.phase !== "matchEnd") || !summary) {
    els.banner.hidden = true;
    modal?.classList.remove("instantwin");
    teardownBeat();
    return;
  }
  if (summary.instantWin && !(beatRoundId === state.roundId && beatDone)) {
    // The beat gate: a fresh instant-win round starts its beat;
    // while the beat is live the banner stays withheld and the
    // overlay is left untouched.
    els.banner.hidden = true;
    modal?.classList.remove("instantwin");
    if (beatRoundId !== state.roundId) startBeat(state.roundId, summary);
    return;
  }
  els.banner.hidden = false;
  // Instant win (TASK 014): the modal carries the burst; the
  // winner's row pulses in. One-shot — the classes are re-applied
  // only while this banner renders.
  modal?.classList.toggle("instantwin", Boolean(summary.instantWin));
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
        // Locked wording; only the human seat's grammar moves (TASK
        // 041): "You were dealt…", "Mina was dealt…".
        `${seatVerb(winner, "were", "was")} dealt an instant-win hand (${kind.replaceAll("-", " ")}). Everyone else pays 2.`,
      ),
    );
  } else if (state.phase === "matchEnd") {
    els.bannerTitle.textContent = `🏆 ${seatVerb(summary.matchWinner as number, "win", "wins")} the match!`;
  } else {
    els.bannerTitle.textContent = "Round over";
  }
  if (summary.instantWin) {
    // Instant-win variant: existing content, unchanged (TASK 032
    // scope) — the note above, the star row, the plain table.
    const table = el("table");
    const rows = [0, 1, 2, 3].map((player) => ({
      player,
      name: SEAT_NAMES[player],
      place: player === (summary.instantWin as { winner: number }).winner ? "★" : "",
      delta: summary.deltas[player],
    }));
    for (const row of rows) {
      const tr = el("tr");
      if (row.player === summary.instantWin.winner) {
        tr.classList.add("winline");
      }
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
    summary.penalties.forEach((penalty, i) => {
      const p = el("p", "note penrow", penaltyLine(penalty));
      p.style.animationDelay = `${i * 130}ms`;
      if (typeof p.style.setProperty === "function") {
        p.style.setProperty("--d", `${i * 130}ms`);
      }
      body.append(p);
    });
    els.continueBtn.hidden = state.phase === "matchEnd";
    els.newMatchBtn.hidden = state.phase !== "matchEnd";
    return;
  }
  // Round-over / match-over summary (TASK 032, John's locked
  // mockup A + PLACE column): a subline naming the round just
  // finished and the target, then a labeled four-column table —
  // PLACE | PLAYER | TOTAL (with muted /13) | ROUND (the signed
  // gain, colored as before). 1st and 2nd carry the TASK 029
  // medal in the PLACE cell; 3rd/4th keep plain ordinal text.
  // Penalty notes stay attached under their payer's row.
  const roundJustFinished = state.match ? state.match.roundNumber - 1 : 1;
  body.append(el("div", "roundsub", `ROUND ${roundJustFinished} · FIRST TO 13`));
  const table = el("table", "sumtable");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(
    el("th", null, "Place"),
    el("th", null, "Player"),
    el("th", "num", "Total"),
    el("th", "num", "Round"),
  );
  thead.append(headRow);
  table.append(thead);
  const rows = roundResultRows(summary.finishOrder, summary.deltas);
  rows.forEach((row, placeIdx) => {
    const tr = el("tr");
    const placeCell = el("td", "place");
    if (placeIdx === 0 || placeIdx === 1) placeCell.append(finishMedal(placeIdx));
    else placeCell.textContent = row.place;
    const total = el("td", "num total");
    total.append(
      el("span", null, `${summary.scores[row.player]}`),
      el("span", "tsuffix", " /13"),
    );
    tr.append(
      placeCell,
      el("td", null, row.name),
      total,
      el(
        "td",
        `delta num ${row.delta > 0 ? "pos" : row.delta < 0 ? "neg" : ""}`,
        row.delta > 0 ? `+${row.delta}` : `${row.delta}`,
      ),
    );
    table.append(tr);
    summary.penalties.forEach((penalty, i) => {
      if (penalty.player !== row.player) return;
      // Penalty rows (TASK 014): each slides in with a red flash,
      // staggered, instead of appearing as plain text — now as a
      // full-width row directly under the payer's row.
      const prow = el("tr", "penrowtr");
      const cell = el("td");
      cell.setAttribute("colspan", "4");
      const p = el("p", "note penrow", penaltyLine(penalty));
      p.style.animationDelay = `${i * 130}ms`;
      // The ::before flash reads the same stagger from --d.
      if (typeof p.style.setProperty === "function") {
        p.style.setProperty("--d", `${i * 130}ms`);
      }
      cell.append(p);
      prow.append(cell);
      table.append(prow);
    });
    // Bomb-penalty note row (TASK 042, audit #4): the seat's net
    // mid-round bomb penalties (both kinds, from the chops ledger)
    // are already in TOTAL but not in ROUND, so a nonzero net gets
    // a small static note under the seat's rows — after its
    // round-end penalty rows, so those stay directly under the
    // payer's row. A zero net shows nothing.
    const note = bombPenaltyNoteLine(row.player, bombPenaltyNet(summary.chops, row.player));
    if (note !== null) {
      const nrow = el("tr", "bombnotetr");
      const cell = el("td");
      cell.setAttribute("colspan", "4");
      cell.append(el("p", "note bombnote", note));
      nrow.append(cell);
      table.append(nrow);
    }
  });
  body.append(table);
  els.continueBtn.hidden = state.phase === "matchEnd";
  els.newMatchBtn.hidden = state.phase !== "matchEnd";
}
