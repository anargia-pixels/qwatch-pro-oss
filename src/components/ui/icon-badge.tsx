import type { JSX } from "react";
import { View } from "react-native";

import { toneClass, type Tone } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { Icon, type IconName } from "./icon";

export function IconBadge({
  icon,
  tone,
}: {
  icon: IconName;
  tone: Tone;
}): JSX.Element {
  return (
    <View
      className={cn(
        "h-10 w-10 items-center justify-center rounded-2xl border-2 border-ink",
        toneClass[tone],
      )}
    >
      <Icon name={icon} />
    </View>
  );
}
