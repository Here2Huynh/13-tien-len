// Shared DOM plumbing for the page adapter (TASK 036 split of
// main.ts): the element table the page renders into, the element
// factory every renderer uses, and the one component two renderers
// share (the finish medal). No state lives here.

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const $btn = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
export const els = {
  scores: $("scores"),
  seats: { 1: $("seat-1"), 2: $("seat-2"), 3: $("seat-3") } as Record<number, HTMLElement>,
  trickInfo: $("trick-info"),
  toBeat: $("to-beat"),
  message: $("message"),
  youArea: $("you-area"),
  youHeader: $("you-header"),
  hand: $("hand"),
  playBtn: $btn("play-btn"),
  passBtn: $btn("pass-btn"),
  hintBtn: $btn("hint-btn"),
  log: $("log"),
  banner: $("banner"),
  bannerTitle: $("banner-title"),
  bannerBody: $("banner-body"),
  continueBtn: $btn("continue-btn"),
  newMatchBtn: $btn("new-match-btn"),
  startScreen: $("start-screen"),
  startBtn: $btn("start-btn"),
  resumeBtn: $btn("resume-btn"),
  roundNum: $("round-num"),
  newMatchTop: $btn("new-match-top"),
  sortBtn: $btn("sort-btn"),
  clearBtn: $btn("clear-btn"),
  helpTop: $btn("help-btn-top"),
  helpStart: $btn("help-btn-start"),
  helpOverlay: $("help-overlay"),
  helpClose: $btn("help-close"),
  oddsTop: $btn("odds-btn-top"),
  oddsOverlay: $("odds-overlay"),
  oddsClose: $btn("odds-close"),
  // TASK 037: the phone header's menu button and the panel that
  // holds the three header actions (How to play, Bomb odds, New
  // match). Desktop hides the button and lays the panel out flat.
  menuBtn: $btn("menu-btn"),
  menuPanel: $("menu-panel"),
};

export function el(tag: string, className?: string | null, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const ORDINALS = ["1st", "2nd", "3rd", "4th"];

// The finish medal (TASK 029, reused by TASK 032): a flat disc
// with the place number stamped in and a ribbon behind it, drawn
// in CSS (.medal). The accessible name carries the place. One
// component, two call sites — the scoreboard badge and the
// round-over banner's PLACE cell — so the two never drift.
export function finishMedal(placeIdx: number): HTMLElement {
  const medal = el(
    "span",
    `medal ${placeIdx === 0 ? "gold" : "silver"}`,
    `${placeIdx + 1}`,
  );
  medal.setAttribute("role", "img");
  medal.setAttribute("aria-label", `Finished ${ORDINALS[placeIdx]}`);
  return medal;
}
