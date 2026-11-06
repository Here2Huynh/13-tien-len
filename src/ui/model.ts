import { sortCards, type Card, type Rank, type Suit } from "../engine/cards.js";
import { detectCombination } from "../engine/combinations.js";
import { detectBomb } from "../engine/bombs.js";
import type { TrickState } from "../engine/trick.js";
import type { Chop } from "../engine/match.js";
import type { Penalty, UnusedBomb } from "../engine/scoring.js";

// Pure view-model helpers for the UI. No DOM, no rule logic: display
// mapping and shallow selection checks only. Anything about whether a
// play is legal belongs to the engine; the controller surfaces the
// engine's own error when a play is rejected.

export const SEAT_NAMES = ["You", "Mina", "Kenji", "Rosa"];

/** The one human-seat conjugation helper (TASK 041, audit #5): the
    human seat is "You" — second person, so "You play / pass / lead /
    take it / were dealt" — and every CPU seat is third person
    ("Mina plays"). Every line that puts a verb after a seat name
    picks its verb form here. */
export function conjugate(player: number, you: string, they: string): string {
  return player === HUMAN ? you : they;
}

/** "<Seat> <verb>" with the verb conjugated for that seat — "You
    play" / "Mina plays". */
export function seatVerb(player: number, you: string, they: string): string {
  return `${SEAT_NAMES[player]} ${conjugate(player, you, they)}`;
}

/** The four seats' standings as one line — "You 5 · Mina -2 ·
    Kenji 3 · Rosa 0" (TASK 039: the Resume button's label and
    the resumed match's opening log line share this text so the
    two signposts can never drift apart). */
export function standingsText(scores: number[]): string {
  return SEAT_NAMES.map((seat, i) => `${seat} ${scores[i]}`).join(" · ");
}
export const HUMAN = 0;

/** Is there a match in progress that New Match would wipe (TASK
    040, audit #9)? A match exists and is undecided — mid-round or
    on a round-over banner. Idle behind the start gate (no match)
    and a decided match (winner set) have nothing to lose, so New
    Match stays one tap there. */
export function matchInProgress(match: { winner: number | null } | null): boolean {
  return match !== null && match.winner === null;
}

const SUIT_GLYPHS: Record<Suit, string> = { spades: "♠", clubs: "♣", diamonds: "♦", hearts: "♥" };
const RED_SUITS: ReadonlySet<Suit> = new Set(["diamonds", "hearts"]);

export interface CardLabel {
  rank: Rank;
  suit: Suit;
  glyph: string;
  text: string;
  color: "red" | "black";
}

export function cardLabel(card: Card): CardLabel {
  return {
    rank: card.rank,
    suit: card.suit,
    glyph: SUIT_GLYPHS[card.suit],
    text: `${card.rank}${SUIT_GLYPHS[card.suit]}`,
    color: RED_SUITS.has(card.suit) ? "red" : "black",
  };
}

export function sortHand(hand: readonly Card[]): Card[] {
  return sortCards(hand);
}

export type SelectionCheck = { ok: true } | { ok: false; error: string };

// Shallow selection checks the UI can make before asking the engine.
// Returns { ok: true } or { ok: false, error }. A selection that
// passes here can still be rejected by the engine (wrong type, does
// not beat, bomb rules) — that error is shown to the player as-is.
export function validateSelection(
  state: TrickState | null | undefined,
  player: number,
  cards: Card[] | null | undefined,
): SelectionCheck {
  if (!state || state.roundOver) return { ok: false, error: "The round is over." };
  if (state.currentPlayer !== player) return { ok: false, error: "It is not your turn." };
  if (!cards || cards.length === 0) {
    return { ok: false, error: NO_SELECTION };
  }
  const held = new Set(state.hands[player].map((card) => card.id));
  if (cards.some((card) => !held.has(card.id))) {
    return { ok: false, error: "Those cards are not in your hand." };
  }
  return { ok: true };
}

// Per-trick presentation view: what each seat last did in the current
// trick. The engine only keeps the latest play, so the UI records the
// actions it drives. Reducer-style, pure.
export type TrickEntry = { type: "play"; cards: Card[] } | { type: "pass" };

export type TrickEvent =
  | { type: "play"; player: number; cards: Card[] }
  | { type: "pass"; player: number };

export interface TrickView {
  entries: Record<number, TrickEntry>; // player -> last action this trick
}

export function emptyTrickView(): TrickView {
  return { entries: {} }; // player -> { type: "play", cards } | { type: "pass" }
}

export function applyToTrickView(view: TrickView, event: TrickEvent): TrickView {
  const entries = { ...view.entries };
  if (event.type === "play") entries[event.player] = { type: "play", cards: event.cards };
  else if (event.type === "pass") entries[event.player] = { type: "pass" };
  return { entries };
}

// Human-readable name for a play, for the log and banners. Detection
// is the engine's; this only phrases the result.
export function describePlay(cards: Card[], wasBomb = false): string {
  const bomb = detectBomb(cards);
  // Pair sequences can only ever be played as bombs, so they always
  // phrase as one. A four of a kind phrases as a bomb only when it
  // actually functioned as one (played against a single 2 / pair of
  // 2s via the bomb path, per the caller); led or played as a plain
  // combination, it phrases as a plain four of a kind.
  if (bomb && (bomb.kind !== "four-of-a-kind" || wasBomb)) {
    if (bomb.kind === "four-of-a-kind") return "a BOMB — four of a kind";
    if (bomb.kind === "pair-sequence-3") return "a BOMB — 3-pair double run";
    return "a BOMB — 4-pair double run";
  }
  const combo = detectCombination(cards);
  if (!combo) return `${cards.length} cards`;
  const top = sortCards(cards)[cards.length - 1];
  const topLabel = cardLabel(top).text;
  switch (combo.type) {
    case "single":
      return `single ${topLabel}`;
    case "pair":
      return `a pair, high card ${topLabel}`;
    case "triple":
      return `a triple, high card ${topLabel}`;
    case "four-of-a-kind":
      return `four of a kind, high card ${topLabel}`;
    case "straight":
      return `a ${cards.length}-card straight, high card ${topLabel}`;
    default:
      return `${cards.length} cards`;
  }
}

// The log line for the bomb penalty (TASK 012, John's wording): the
// moment a played 2 or pair of 2s is bombed, its owner pays the
// bomber 1 point per 2.
// "Bomb penalty: Mina pays 1 to Kenji — her 2 was bombed."
const POSSESSIVES = ["your", "her", "his", "her"]; // by seat: You, Mina, Kenji, Rosa

export function bombPenaltyLogLine({ payer, payee, points }: Chop): string {
  const what = points === 2 ? "pair of 2s" : "2";
  return `Bomb penalty: ${seatVerb(payer, "pay", "pays")} ${points} to ${SEAT_NAMES[payee]} — ${POSSESSIVES[payer]} ${what} was bombed.`;
}

// The log line for the bombed-bomb penalty (TASK 021): the moment a
// bomb is beaten by another bomb, its owner pays the player who
// bombed it 1 point.
// "Bomb penalty: Mina pays 1 to Kenji — her bomb was bombed."
export function bombedBombLogLine({ payer, payee }: Chop): string {
  return `Bomb penalty: ${seatVerb(payer, "pay", "pays")} 1 to ${SEAT_NAMES[payee]} — ${POSSESSIVES[payer]} bomb was bombed.`;
}

// The companion line when a player who passed earlier in the same
// trick returns with a comeback bomb (TASK 016).
export function comebackLogLine(player: number): string {
  return `${seatVerb(player, "are", "is")} back in the trick.`;
}

// ---- Player-facing rejection copy (TASK 041, audit #7) -------------
// The engine's rejection strings are terse rule statements ("Play
// does not beat the current trick play"). The page shows player copy
// instead — guidance that names what is on the table where the state
// allows it. Presentation only: the engine's strings and behavior are
// unchanged, and any string not mapped here is shown exactly as the
// engine (or the selection check) wrote it.
export type MessageTone = "" | "hint" | "error";

/** The engine's rejection strings this layer rewrites (verbatim). */
export const ENGINE_ERRORS = {
  doesNotBeat: "Play does not beat the current trick play",
  bombLead: "A bomb cannot be led",
  comeback:
    "Comeback after passing requires four of a kind or a 4-pair double run that bombs the current play",
  openingLead: "Opening lead must include 3 of spades",
  leaderPass: "The trick leader must play, not pass",
  notACombination: "Not a valid combination",
} as const;

/** The selection check's empty-selection string (validateSelection). */
export const NO_SELECTION = "Select at least one card first.";

// The play on the table, named for a sentence: the log's own
// phrasing (describePlay) for plain sets; a pair-run bomb by its
// length and high card.
function tableName(cards: Card[]): string {
  const bomb = detectBomb(cards);
  if (bomb && bomb.kind !== "four-of-a-kind") {
    const top = cardLabel(sortCards(cards)[cards.length - 1]).text;
    return `a ${bomb.kind === "pair-sequence-3" ? 3 : 4}-pair double run, high card ${top}`;
  }
  return describePlay(cards);
}

// A name that ends in ", high card X" takes a closing comma mid-
// sentence: "Beat a pair, high card K♦, with a higher pair".
function midSentence(name: string): string {
  return name.includes(", high card ") ? `${name},` : name;
}

// What beats the table, per the engine's ladder (plays.beats +
// bombs.bombBeats / bombOnBombBeats) — phrased, never decided, here.
function beatAdvice(cards: Card[]): string {
  const named = midSentence(tableName(cards));
  const bomb = detectBomb(cards);
  if (bomb?.kind === "pair-sequence-4") {
    return `Beat ${named} with a higher 4-pair double run — or Pass.`;
  }
  if (bomb?.kind === "pair-sequence-3") {
    return `Beat ${named} with a higher 3-pair double run or a 4-pair double run — or Pass.`;
  }
  const combo = detectCombination(cards);
  if (!combo) return "Beat the table with a higher play of the same kind — or Pass.";
  if (combo.type === "four-of-a-kind") {
    return `Beat ${named} with a higher four of a kind or a 4-pair double run — or Pass.`;
  }
  if (combo.rank === "2" && combo.type === "triple") return "Nothing beats triple 2s — Pass.";
  if (combo.rank === "2" && combo.type === "single") {
    return `Beat ${named} with a higher single or a bomb — or Pass.`;
  }
  if (combo.rank === "2" && combo.type === "pair") {
    return `Beat ${named} with a higher pair, four of a kind, or a 4-pair double run — or Pass.`;
  }
  const kind = combo.type === "straight" ? `${cards.length}-card straight` : combo.type;
  return `Beat ${named} with a higher ${kind} — or Pass.`;
}

/** The player copy for a rejected action. `error` is the engine's
    (or the selection check's) message; `trick` is the state the
    action was rejected against (rejections never change it). An
    unmapped message falls back to its own text, unchanged. */
export function playerErrorText(error: string, trick: TrickState | null | undefined): string {
  const onTable = trick?.currentPlay?.cards ?? null;
  switch (error) {
    case ENGINE_ERRORS.doesNotBeat:
      return onTable ? beatAdvice(onTable) : error;
    case ENGINE_ERRORS.bombLead:
      return "A double run can't lead — it plays only as a bomb. Lead a single, pair, triple, straight, or four of a kind.";
    case ENGINE_ERRORS.comeback:
      return onTable
        ? `You passed this trick, so only four of a kind or a 4-pair double run that beats ${midSentence(tableName(onTable))} brings you back — or Pass.`
        : "You passed this trick, so only four of a kind or a 4-pair double run brings you back — or Pass.";
    case ENGINE_ERRORS.openingLead:
      return "The first play of the match must include the 3♠.";
    case ENGINE_ERRORS.leaderPass:
      return "You lead this trick, so you can't pass — play any set.";
    case ENGINE_ERRORS.notACombination:
      return "Those cards don't make a set. Play a single, pair, triple, straight, or four of a kind — or a double run as a bomb.";
    case NO_SELECTION:
      return onTable
        ? `${NO_SELECTION.slice(0, -1)} — or Pass.`
        : `${NO_SELECTION.slice(0, -1)} — tap cards in your hand, then Play.`;
    default:
      return error;
  }
}

function describeUnusedBomb(bomb: UnusedBomb): string {
  if (bomb.kind === "four-of-a-kind") return `four ${bomb.rank}s`;
  const pairs = bomb.kind === "pair-sequence-3" ? 3 : 4;
  return `a ${pairs}-pair double run (${bomb.from}s–${bomb.to}s)`;
}

// The round-end penalty line (TASK 016), itemized: each held 2 named
// by card, each unused bomb described, the points attributable to
// each cause, and the total. Replaces the old generic parenthesis
// "(leftover 2s / unused bombs)".
// "Penalty: Rosa pays 3 to You: 2♠, 2♥ held (2 pts), four 9s unused (1 pt)."
export function penaltyLine(penalty: Penalty): string {
  const causes: string[] = [];
  if (penalty.twos.length > 0) {
    const labels = penalty.twos.map((card) => cardLabel(card).text).join(", ");
    const n = penalty.twos.length;
    causes.push(`${labels} held (${n} ${n === 1 ? "pt" : "pts"})`);
  }
  for (const bomb of penalty.bombs) {
    causes.push(`${describeUnusedBomb(bomb)} unused (1 pt)`);
  }
  return `Penalty: ${seatVerb(penalty.player, "pay", "pays")} ${penalty.points} to ${SEAT_NAMES[penalty.paidTo]}: ${causes.join(", ")}.`;
}

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th"];

export interface ResultRow {
  player: number;
  name: string;
  place: string;
  delta: number;
}

export interface ScoreRow {
  player: number;
  name: string;
  score: number;
  isLeader: boolean;
}

// Rows for the round-end banner: finish order + score deltas.
export function roundResultRows(finishOrder: number[], deltas: number[], names: string[] = SEAT_NAMES): ResultRow[] {
  return finishOrder.map((player, index) => ({
    player,
    name: names[player],
    place: PLACE_LABELS[index],
    delta: deltas[player],
  }));
}

export function scoreRows(scores: number[], names: string[] = SEAT_NAMES): ScoreRow[] {
  const best = Math.max(...scores);
  return scores.map((score, player) => ({
    player,
    name: names[player],
    score,
    isLeader: score === best && score > 0,
  }));
}
