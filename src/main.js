import { createDeck } from "./engine/cards.js";

const deck = createDeck();
document.getElementById("status").textContent =
  `Core card engine ready: ${deck.length}-card deck.`;
