import type { JSX } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { colors } from "@/lib/theme";

import { Text } from "./text";

export function Input({
  label,
  ...props
}: TextInputProps & { label: string }): JSX.Element {
  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-sm">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-2xl border-2 border-ink bg-cream px-4 py-3 font-grotesk-medium text-base text-ink"
        {...props}
      />
    </View>
  );
}
