import { extendTailwindMerge, type ClassNameValue } from "tailwind-merge";
import { createTV } from "tailwind-variants";

import { colors } from "./theme";

/** Teaches tailwind-merge the custom `@theme` tokens in `src/global.css`. */
const twMergeConfig = {
  extend: {
    theme: {
      color: Object.keys(colors),
      shadow: ["brutal", "brutal-xs", "brutal-sm", "brutal-md"],
      font: ["grotesk", "grotesk-medium", "grotesk-bold"],
    },
  },
};

const twMerge = extendTailwindMerge(twMergeConfig);

/** Joins class names; later classes win over conflicting earlier ones. */
export function cn(...classes: ClassNameValue[]): string {
  return twMerge(...classes);
}

export const tv = createTV({ twMergeConfig });
