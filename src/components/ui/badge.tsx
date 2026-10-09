import type { JSX } from "react";
import { View } from "react-native";

import { toneClass, type Tone } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export function Badge({
  label,
  tone = "paper",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
}): JSX.Element {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full border-2 border-ink px-3 py-1",
        toneClass[tone],
      )}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      <Text weight="bold" className="text-xs">
        {label}
      </Text>
    </View>
  );
}
