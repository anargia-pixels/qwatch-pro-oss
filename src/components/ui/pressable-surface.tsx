import type { JSX, ReactNode } from "react";
import type {
  GestureResponderEvent,
  PressableProps,
  ViewStyle,
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs } from "@/lib/motion";
import { colors } from "@/lib/theme";

import { AnimatedPressable } from "./animated";

/** Hard shadow at rest, matching the `shadow-brutal-*` tokens. */
const SHADOW_PX = { none: 0, sm: 2, md: 3, lg: 4 } as const;
/** How far a pressed surface sinks towards its shadow. */
const SINK_PX = { none: 0, sm: 2, md: 2, lg: 3 } as const;

export type Depth = keyof typeof SHADOW_PX;

export type PressableSurfaceProps = Omit<
  PressableProps,
  "style" | "children"
> & {
  className?: string;
  /** Hard shadow size. Flat surfaces squish instead of sinking. */
  depth?: Depth;
  /** Corner radius at rest and fully pressed: the M3 Expressive shape morph. */
  radius?: readonly [rest: number, pressed: number];
  children: ReactNode;
};

/**
 * Base for every tappable surface. On press it sinks into its hard shadow,
 * shrinks slightly and squares its corners, all on the fast spatial spring,
 * so a quick tap still shows the full press and a little bounce on release.
 */
export function PressableSurface({
  className,
  depth = "none",
  radius,
  onPressIn,
  onPressOut,
  children,
  ...props
}: PressableSurfaceProps): JSX.Element {
  const pressed = useSharedValue(0);
  const shadow = SHADOW_PX[depth];
  const sink = SINK_PX[depth];
  const squish = depth === "none" ? 0.06 : 0.02;

  const style = useAnimatedStyle(() => {
    const progress = pressed.get();
    const offset = Math.max(0, shadow - sink * progress);
    const animated: ViewStyle = {
      transform: [
        { translateX: sink * progress },
        { translateY: sink * progress },
        { scale: 1 - squish * progress },
      ],
    };
    if (shadow > 0) {
      animated.boxShadow = [
        {
          offsetX: offset,
          offsetY: offset,
          blurRadius: 0,
          spreadDistance: 0,
          color: colors.ink,
        },
      ];
    }
    // Only when asked, so the className's corner radius otherwise stays in charge.
    if (radius) {
      animated.borderRadius = radius[0] + (radius[1] - radius[0]) * progress;
    }
    return animated;
  });

  const pressIn = (event: GestureResponderEvent): void => {
    pressed.set(withSpring(1, springs.fastSpatial));
    onPressIn?.(event);
  };
  const pressOut = (event: GestureResponderEvent): void => {
    pressed.set(withSpring(0, springs.fastSpatial));
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      onPressIn={pressIn}
      onPressOut={pressOut}
      className={className}
      style={style}
    >
      {children}
    </AnimatedPressable>
  );
}
