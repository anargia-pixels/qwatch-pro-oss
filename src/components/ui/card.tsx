import type { JSX, ReactNode } from "react";
import { View } from "react-native";

import { toneClass, type Tone } from "@/lib/theme";
import { cn } from "@/lib/utils";

import type { IconName } from "./icon";
import { IconBadge } from "./icon-badge";
import { Text } from "./text";

export function Card({
  tone = "paper",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <View
      className={cn(
        "rounded-3xl border-2 border-ink p-4 shadow-brutal",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </View>
  );
}

/** Icon, title and an optional trailing slot (usually a `Badge`). */
export function CardHeader({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <View className="flex-row items-center gap-3">
      <IconBadge icon={icon} tone="paper" />
      <Text weight="bold" className="flex-1 text-lg">
        {title}
      </Text>
      {children}
    </View>
  );
}
