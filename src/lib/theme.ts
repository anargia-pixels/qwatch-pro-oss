/** JS copies of the `@theme` colours in `src/global.css`, for props that take a colour value. */
export const colors = {
  cream: "#fff6e5",
  paper: "#fffdf7",
  ink: "#2b2118",
  muted: "#7a6a5c",
  peach: "#ffc9a9",
  rose: "#ffc4d4",
  sky: "#bfe3ff",
  mint: "#bdebcf",
  butter: "#ffe69a",
  lilac: "#d9ccff",
} as const;

/** Static class names so Tailwind can see them. */
export const toneClass = {
  paper: "bg-paper",
  peach: "bg-peach",
  rose: "bg-rose",
  sky: "bg-sky",
  mint: "bg-mint",
  butter: "bg-butter",
  lilac: "bg-lilac",
} as const;

export type Tone = keyof typeof toneClass;

/** Font classes backed by the `--font-grotesk*` tokens in `src/global.css`. */
export const fontClass = {
  regular: "font-grotesk",
  medium: "font-grotesk-medium",
  bold: "font-grotesk-bold",
} as const;
