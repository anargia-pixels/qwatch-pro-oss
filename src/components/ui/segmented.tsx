import type { JSX } from "react";
import { View } from "react-native";

import { useSelectionStyle } from "@/lib/motion";

import { AnimatedView } from "./animated";
import { PressableSurface } from "./pressable-surface";
import { Text } from "./text";

/** Pick one of a few values, e.g. measurement intervals. */
export function Segmented<Value extends string | number>({
  options,
  value,
  onChange,
  format = String,
}: {
  options: readonly Value[];
  value: Value | null;
  onChange: (next: Value) => void;
  format?: (option: Value) => string;
}): JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => (
        <SegmentedOption
          key={String(option)}
          label={format(option)}
          selected={option === value}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}

function SegmentedOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): JSX.Element {
  const indicator = useSelectionStyle(selected);
  return (
    <PressableSurface
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="rounded-full border-2 border-ink bg-paper px-3 py-1.5"
    >
      <AnimatedView
        className="absolute inset-0 rounded-full bg-ink"
        style={indicator}
      />
      <Text weight="bold" className={selected ? "text-cream" : undefined}>
        {label}
      </Text>
    </PressableSurface>
  );
}
