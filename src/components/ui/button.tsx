import type { JSX } from "react";
import { ActivityIndicator } from "react-native";

import { colors, toneClass, type Tone } from "@/lib/theme";
import { cn, tv } from "@/lib/utils";

import { Icon, type IconName } from "./icon";
import { PressableSurface } from "./pressable-surface";
import { Text } from "./text";

const button = tv({
  slots: {
    base: "flex-row items-center justify-center gap-2 rounded-2xl border-2 border-ink",
    label: "",
  },
  variants: {
    size: {
      md: { base: "px-4 py-3", label: "text-base" },
      sm: { base: "px-3 py-2", label: "text-sm" },
    },
    inactive: {
      true: { base: "opacity-50" },
    },
  },
  defaultVariants: { size: "md" },
});

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  size?: "md" | "sm";
  className?: string;
};

export function Button({
  label,
  onPress,
  tone = "butter",
  icon,
  disabled = false,
  busy = false,
  size = "md",
  className,
}: ButtonProps): JSX.Element {
  const inactive = disabled || busy;
  const styles = button({ size, inactive });
  return (
    <PressableSurface
      depth="md"
      radius={[16, 10]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      className={styles.base({ className: cn(toneClass[tone], className) })}
    >
      {busy ? <ActivityIndicator color={colors.ink} size="small" /> : null}
      {!busy && icon ? (
        <Icon name={icon} size={size === "md" ? 18 : 15} />
      ) : null}
      <Text weight="bold" className={styles.label()}>
        {label}
      </Text>
    </PressableSurface>
  );
}
