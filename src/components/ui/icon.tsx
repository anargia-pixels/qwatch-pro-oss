import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps, JSX } from "react";

import { colors } from "@/lib/theme";

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  size = 18,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}): JSX.Element {
  return <Feather name={name} size={size} color={color} />;
}
