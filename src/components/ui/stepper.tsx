import type { JSX } from "react";
import { View } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { AnimatedView } from "./animated";
import { Icon, type IconName } from "./icon";
import { PressableSurface } from "./pressable-surface";
import { Text } from "./text";

/** Initial velocity that makes the value pop out (+) or dip in (−) by about 10%. */
const BUMP_VELOCITY = 6;

/** Pads the 36 dp buttons out to a 48 dp touch target. */
const HIT_SLOP = 6;

/** − value + control for numbers with a fixed step. */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format = String,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (value: number) => string;
  label: string;
}): JSX.Element {
  const scale = useSharedValue(1);
  const bumpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const shown = format(value);
  const stepBy = (delta: number): void => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    scale.set(
      withSpring(1, {
        ...springs.fastSpatial,
        velocity: Math.sign(delta) * BUMP_VELOCITY,
      }),
    );
    onChange(next);
  };

  return (
    <View className="flex-row items-center gap-2">
      <StepButton
        icon="minus"
        label={`Decrease ${label}`}
        value={shown}
        disabled={value <= min}
        onPress={() => stepBy(-step)}
      />
      <AnimatedView
        className="min-w-16"
        style={bumpStyle}
        accessibilityLiveRegion="polite"
      >
        <Text weight="bold" className="text-center text-base">
          {shown}
        </Text>
      </AnimatedView>
      <StepButton
        icon="plus"
        label={`Increase ${label}`}
        value={shown}
        disabled={value >= max}
        onPress={() => stepBy(step)}
      />
    </View>
  );
}

function StepButton({
  icon,
  label,
  value,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  /** Current value, read out with the button so screen readers hear it. */
  value: string;
  disabled: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <PressableSurface
      depth="sm"
      radius={[12, 7]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      className={cn(
        "h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-butter",
        disabled && "opacity-40",
      )}
    >
      <Icon name={icon} size={16} />
    </PressableSurface>
  );
}
