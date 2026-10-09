import type { JSX } from "react";
import {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs, useSpringTo } from "@/lib/motion";
import { colors } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { AnimatedPressable, AnimatedView } from "./animated";

/** Pads the 32 dp tall track out to a 48 dp touch target. */
const HIT_SLOP = { top: 8, bottom: 8 } as const;

/** Track inner width (w-14 minus border and padding) minus the thumb (w-6). */
const THUMB_TRAVEL = 24;

/**
 * M3 Expressive switch: the thumb slides on a spatial spring, is small when
 * off, full size when on and grows further while pressed; colours follow on
 * an effects spring.
 */
export function Switch({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  const position = useSpringTo(value ? 1 : 0, springs.fastSpatial);
  const tint = useSpringTo(value ? 1 : 0, springs.defaultEffects);
  const pressed = useSharedValue(0);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      tint.get(),
      [0, 1],
      [colors.paper, colors.mint],
    ),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      tint.get(),
      [0, 1],
      [colors.cream, colors.ink],
    ),
    transform: [
      { translateX: position.get() * THUMB_TRAVEL },
      { scale: 0.7 + 0.3 * position.get() + 0.15 * pressed.get() },
    ],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={() => onChange(!value)}
      onPressIn={() => pressed.set(withSpring(1, springs.fastSpatial))}
      onPressOut={() => pressed.set(withSpring(0, springs.fastSpatial))}
      className={cn(
        "h-8 w-14 justify-center rounded-full border-2 border-ink px-0.5",
        disabled && "opacity-50",
      )}
      style={trackStyle}
    >
      <AnimatedView
        className="h-6 w-6 rounded-full border-2 border-ink"
        style={thumbStyle}
      />
    </AnimatedPressable>
  );
}
