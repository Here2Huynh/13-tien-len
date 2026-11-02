import { RANKS, SUITS, makeCard, type Card } from "../src/engine/cards.js";
import { detectBomb, type BombKind } from "../src/engine/bombs.js";
import { detectInstantWin, type InstantWinKind } from "../src/engine/instantWin.js";

// Exact dealt-hand odds for the Bomb odds card (TASK 022), driven by
// the engine's own detectors — no pattern is defined here.
//
// Every one of the C(52,13) dealt hands is covered, grouped by its
// rank-count vector (how many cards of each of the 13 ranks it holds;
// a vector with counts c stands for prod C(4, c_r) hands). Both
// detectors read ranks only — suits never change a verdict — so one
// representative hand per vector speaks for the whole group.
//
// - Instant wins: detectInstantWin runs on each vector's representative
//   13-card hand. A hand is counted under the ONE kind the engine
//   awards it (the engine checks four 2s, dragon straight, three
//   consecutive triples, five consecutive pairs, six pairs, in that
//   order), so the five rows sum to "any instant win".
// - Bombs: detectBomb runs on the representative of EVERY rank-count
//   vector of 1 to 13 cards; the vectors it calls a bomb are the bomb
//   patterns. A hand holds a bomb kind when one of that kind's
//   patterns fits inside its counts. A hand with a 4-pair double run
//   also holds a 3-pair double run, so the bomb rows overlap and
//   "any bomb" is less than their sum.
//
// test/bomb-odds.test.ts runs this and pins the card's figures to it.

export const TOTAL_HANDS = 635013559600; // C(52,13), exact in a double

export interface DealtOdds {
  total: number;
  /** How many distinct rank multisets detectBomb accepts, per kind. */
  patterns: Record<BombKind, number>;
  bombs: Record<BombKind, number>;
  anyBomb: number;
  instantWins: Record<InstantWinKind, number>;
  anyInstantWin: number;
}

const CHOOSE4 = [1, 4, 6, 4, 1]; // C(4, k)

// The deck as a [rank][suit] table, so representative hands are
// assembled from shared card objects instead of rebuilt each time.
const CARD_TABLE: Card[][] = RANKS.map((rank) => SUITS.map((suit) => makeCard(rank, suit)));

// Visit every rank-count vector (each entry 0..4) whose total is in
// [minCards, maxCards], with its representative hand: for each rank,
// the lowest suits up to its count. Both arrays are reused between
// visits; visit must copy anything it keeps.
function forEachCounts(
  minCards: number,
  maxCards: number,
  visit: (counts: readonly number[], hand: readonly Card[]) => void,
): void {
  const counts = new Array<number>(RANKS.length).fill(0);
  const hand: Card[] = [];
  const walk = (i: number): void => {
    if (i === RANKS.length) {
      if (hand.length >= minCards) visit(counts, hand);
      return;
    }
    const before = hand.length;
    for (let n = 0; n <= 4 && before + n <= maxCards; n++) {
      counts[i] = n;
      if (n > 0) hand.push(CARD_TABLE[i][n - 1]);
      walk(i + 1);
    }
    hand.length = before;
    counts[i] = 0;
  };
  walk(0);
}

export function enumerateDealtOdds(): DealtOdds {
  const patterns: Record<BombKind, number[][]> = {
    "pair-sequence-3": [],
    "pair-sequence-4": [],
    "four-of-a-kind": [],
  };
  forEachCounts(1, 13, (counts, hand) => {
    const bomb = detectBomb([...hand]);
    if (bomb) patterns[bomb.kind].push([...counts]);
  });
  const kinds = Object.keys(patterns) as BombKind[];
  const fits = (pattern: readonly number[], counts: readonly number[]): boolean =>
    pattern.every((n, i) => n <= counts[i]);

  const odds: DealtOdds = {
    total: 0,
    patterns: {
      "pair-sequence-3": patterns["pair-sequence-3"].length,
      "pair-sequence-4": patterns["pair-sequence-4"].length,
      "four-of-a-kind": patterns["four-of-a-kind"].length,
    },
    bombs: { "pair-sequence-3": 0, "pair-sequence-4": 0, "four-of-a-kind": 0 },
    anyBomb: 0,
    instantWins: {
      "four-2s": 0,
      "six-pairs": 0,
      "five-consecutive-pairs": 0,
      "dragon-straight": 0,
      "three-consecutive-triples": 0,
    },
    anyInstantWin: 0,
  };
  forEachCounts(13, 13, (counts, hand) => {
    let weight = 1;
    for (const n of counts) weight *= CHOOSE4[n];
    odds.total += weight;

    let anyBomb = false;
    for (const kind of kinds) {
      if (patterns[kind].some((pattern) => fits(pattern, counts))) {
        odds.bombs[kind] += weight;
        anyBomb = true;
      }
    }
    if (anyBomb) odds.anyBomb += weight;

    const win = detectInstantWin([...hand]);
    if (win) {
      odds.instantWins[win.kind] += weight;
      odds.anyInstantWin += weight;
    }
  });
  return odds;
}

// The card's number format: a percentage to two decimals (three
// under 0.1%, so the rarest rows keep two significant figures), and
// "1 in N" rounded to a whole hand (one decimal under 10).
export function formatPercent(hands: number, total: number = TOTAL_HANDS): string {
  const pct = (100 * hands) / total;
  return `${pct.toFixed(pct >= 0.1 ? 2 : 3)}%`;
}

export function formatOneIn(hands: number, total: number = TOTAL_HANDS): string {
  const n = total / hands;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-US")}`;
}

// The card's rows, top to bottom: player-facing label -> hand count.
export function cardRows(odds: DealtOdds): { bombs: [string, number][]; instantWins: [string, number][] } {
  return {
    bombs: [
      ["3-pair double run", odds.bombs["pair-sequence-3"]],
      ["Four of a kind", odds.bombs["four-of-a-kind"]],
      ["4-pair double run", odds.bombs["pair-sequence-4"]],
      ["Any bomb", odds.anyBomb],
    ],
    instantWins: [
      ["Six pairs", odds.instantWins["six-pairs"]],
      ["Four 2s", odds.instantWins["four-2s"]],
      ["Five consecutive pairs", odds.instantWins["five-consecutive-pairs"]],
      ["Dragon straight", odds.instantWins["dragon-straight"]],
      ["Three consecutive triples", odds.instantWins["three-consecutive-triples"]],
      ["Any instant win", odds.anyInstantWin],
    ],
  };
}
