import { useEffect, useRef } from "react";
import {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";

/** Converts a Material spring (damping ratio, stiffness, unit mass) to Reanimated's physics config. */
function spring(dampingRatio: number, stiffness: number): WithSpringConfig {
  return {
    damping: 2 * dampingRatio * Math.sqrt(stiffness),
    stiffness,
    mass: 1,
  };
}

/**
 * Material 3 Expressive motion scheme (androidx `ExpressiveMotionTokens`), the
 * tokens in use.
 * Spatial springs move, resize or reshape things and may overshoot; effects
 * springs change colour or opacity and never overshoot. Reanimated skips them
 * when the system "reduce motion" setting is on.
 */
export const springs = {
  fastSpatial: spring(0.6, 800),
  defaultSpatial: spring(0.8, 380),
  slowSpatial: spring(0.8, 200),
  defaultEffects: spring(1, 1600),
} as const;

/**
 * A number that springs from `from` to each new `target`. `enterDelayMs`
 * holds back only the first spring (an entrance stagger); later changes
 * start at once.
 */
export function useSpringTo(
  target: number,
  config: WithSpringConfig,
  {
    from = target,
    enterDelayMs = 0,
  }: { from?: number; enterDelayMs?: number } = {},
): SharedValue<number> {
  const value = useSharedValue(from);
  const entered = useRef(false);
  useEffect(() => {
    const delayMs = entered.current ? 0 : enterDelayMs;
    entered.current = true;
    value.set(withDelay(delayMs, withSpring(target, config)));
  }, [target, config, enterDelayMs, value]);
  return value;
}

/** Selection indicator that grows in (spatial) while it fades in (effects). */
export function useSelectionStyle(selected: boolean) {
  const size = useSpringTo(selected ? 1 : 0, springs.fastSpatial);
  const alpha = useSpringTo(selected ? 1 : 0, springs.defaultEffects);
  return useAnimatedStyle(() => ({
    opacity: alpha.get(),
    transform: [{ scale: 0.6 + 0.4 * size.get() }],
  }));
}
