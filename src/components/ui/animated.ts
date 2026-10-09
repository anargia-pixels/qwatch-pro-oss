import { Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { withUniwind } from "uniwind";

/** Reanimated components that also accept `className`. */
export const AnimatedView = withUniwind(Animated.View);
export const AnimatedPressable = withUniwind(
  Animated.createAnimatedComponent(Pressable),
);
