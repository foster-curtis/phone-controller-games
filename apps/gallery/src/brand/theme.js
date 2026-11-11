/*
 * Color scheme for games.fostercurtis.dev.
 *
 * Two states, dark by default. The OS preference is ignored, same as the main
 * site (which defaults the other way). A visitor's choice is stored under
 * `theme` in localStorage. That key is per-origin, so it doesn't collide with
 * the main site's choice.
 *
 * Two parts:
 *   1. THEME_INIT — paste as an inline <script> in <head>, before any
 *      stylesheet, so there's no flash of the wrong scheme. It must be inline
 *      (not a module), because it has to run while the HTML is still parsing.
 *   2. initThemeToggle() — call once after the DOM is ready. It wires every
 *      `.theme-toggle` button and keeps its accessible name accurate.
 */

export const THEME_INIT = `(function () {
  try {
    var light = localStorage.getItem("theme") === "light";
    document.documentElement.dataset.theme = light ? "light" : "dark";
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();`;

const STORAGE_KEY = "theme";

const current = () =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

const labelFor = (scheme) =>
  scheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

export function initThemeToggle(root = document) {
  const buttons = [...root.querySelectorAll(".theme-toggle")];
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-label", labelFor(current())));

  buttons.forEach((button) =>
    button.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be blocked (private mode). The switch still works for
        // this page view; it just won't be remembered.
      }
      sync();
    }),
  );

  sync();
}
