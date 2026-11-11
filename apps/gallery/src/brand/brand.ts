/**
 * Brand values for the places that can't read CSS: the web manifest and the
 * `theme-color` meta tag. Mirrors tokens.css; keep the two in sync.
 */
export const brand = {
  colors: {
    ink: "#14161A",
    paper: "#FFFFFF",
    amber: "#E8A33D",
    gray: "#6B7280",
  },
  /** The wordmark split. `.dev` is amber, always. */
  wordmarkStem: "fostercurtis",
  wordmarkTld: ".dev",
  /** The muted label after the divider. Lowercase, to match the wordmark. */
  label: "games",
  /** Accessible name for the whole lockup. */
  lockupLabel: "fostercurtis.dev games",
  parentUrl: "https://fostercurtis.dev",
} as const;
