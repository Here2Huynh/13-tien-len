import type { ControllerState } from "../ui/controller.js";

// Score persistence (TASK 031): SCORES ONLY — the four seats'
// points plus the round number, in localStorage under a versioned
// key. The hand in progress never persists: a reload restores the
// standings behind the start gate, and Resume deals the saved
// round fresh. Every access is failure-tolerant — storage that is
// missing or throws (private mode, quota) must never break a
// render or a click, so each helper swallows its own exceptions.
// (Moved out of main.ts unchanged in TASK 036.)
//
// TASK 039 (audit #10): the save is written ONLY when a round
// lands (the round-end phase) — never mid-round. Task 031 wrote
// on every score change, so a mid-round bomb penalty that took a
// seat to 13 was written and then rejected by the parser's cap
// on reload, silently losing the match; mid-round writes also
// kept the round's penalties while re-dealing the round. With
// round-end-only writes, a save the game writes is always a save
// the game accepts back, and a mid-round reload returns to the
// last completed round's standings.
const SCORE_KEY = "thirteen.matchScore.v1";
// Owner's validation band (pick A, 2026-11-02): points are
// integers from -99 to 12. Real scores go negative every match
// (round deltas are +2/+1/-1/-2), so the floor admits them; the
// cap keeps the filed intent that a finished match never restores
// (a seat at 13+ means the match was decided at a round end).
interface ScoreSave {
  scores: number[];
  round: number;
}

function scoreStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let lastScoreJson: string | null = null;

function writeScoreSave(save: ScoreSave): void {
  const store = scoreStorage();
  if (!store) return;
  const json = JSON.stringify(save);
  if (json === lastScoreJson) return;
  try {
    store.setItem(SCORE_KEY, json);
    lastScoreJson = json;
  } catch {
    // Unavailable storage: the game plays exactly as without it.
  }
}

export function clearScoreSave(): void {
  lastScoreJson = null;
  const store = scoreStorage();
  if (!store) return;
  try {
    store.removeItem(SCORE_KEY);
  } catch {
    // Same tolerance as writes.
  }
}

function parseScoreSave(raw: string): ScoreSave | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const { scores, round } = data as { scores?: unknown; round?: unknown };
    if (!Array.isArray(scores) || scores.length !== 4) return null;
    if (
      !scores.every(
        (s): s is number =>
          typeof s === "number" && Number.isInteger(s) && s >= -99 && s <= 12,
      )
    ) {
      return null;
    }
    if (typeof round !== "number" || !Number.isInteger(round) || round < 1) return null;
    return { scores: [...scores], round };
  } catch {
    return null;
  }
}

// Read at Start, not at boot: the start gate means nothing needs
// the seed earlier. A corrupt or out-of-range save is discarded
// (removed), never restored, never crashed on.
export function loadScoreSave(): ScoreSave | null {
  const store = scoreStorage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(SCORE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const save = parseScoreSave(raw);
  if (save === null) clearScoreSave();
  return save;
}

// Runs on every controller state change (selection-only redraws
// don't emit, so this fires exactly when game state moved) — but
// it only ever WRITES at the round-end phase (TASK 039): the one
// moment the standings are final for a completed round. At that
// point match.roundNumber has already advanced (the engine
// increments it as the round lands), so the save holds the round
// Resume will deal. Mid-round states — bomb penalties included —
// write nothing and leave any existing save untouched; a decided
// match clears the save, so no resumable save remains. (Clearing
// on New Match happens in the page's click handlers, which call
// clearScoreSave directly.)
export function persistScore(state: ControllerState): void {
  const match = state.match;
  if (!match) return; // idle behind the start gate: keep any save
  if (match.winner !== null) {
    clearScoreSave();
    return;
  }
  if (state.phase !== "roundEnd") return;
  writeScoreSave({ scores: [...match.scores], round: match.roundNumber });
}
