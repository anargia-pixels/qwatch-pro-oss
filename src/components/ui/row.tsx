import type { JSX, ReactNode } from "react";
import { View } from "react-native";

import { Text } from "./text";

/** A labelled row inside a settings card; the control goes in `children`. */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-3 py-1">
      <View className="flex-1">
        <Text weight="medium" className="text-base">
          {label}
        </Text>
        {hint ? <Text className="text-xs text-muted">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
