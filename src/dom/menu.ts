import { els } from "./elements.js";

// The phone header menu (TASK 037). At the phone breakpoint (CSS,
// <=520px) the header collapses to "13" + Round N + a single ☰ MENU
// button; the panel it opens holds the SAME three header buttons
// (How to play, Bomb odds, New match) with the same handlers main.ts
// wires — the panel only moves them, it never duplicates them. On
// desktop the button is hidden and the panel is display:contents,
// so the three buttons sit in the header exactly as before.
//
// Pure presentation: the open state lives in the button's
// aria-expanded attribute (the CSS reads it), no controller call, no
// render. Disclosure pattern: an item click runs its own handler and
// then closes the panel; a click outside the menu or Escape closes it.

export function menuOpen(): boolean {
  return els.menuBtn.getAttribute("aria-expanded") === "true";
}

export function setMenu(open: boolean): void {
  els.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

export function wireMenu(): void {
  els.menuBtn.addEventListener("click", () => setMenu(!menuOpen()));
  // Bubbles up from an item AFTER the item's own handler has run.
  els.menuPanel.addEventListener("click", () => {
    if (menuOpen()) setMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (!menuOpen()) return;
    const target = event.target as Node | null;
    if (target && (els.menuBtn.contains(target) || els.menuPanel.contains(target))) return;
    setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menuOpen()) return;
    setMenu(false);
    els.menuBtn.focus();
  });
}
