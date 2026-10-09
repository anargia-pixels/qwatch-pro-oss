import type { JSX } from "react";
import { View } from "react-native";

export function Separator(): JSX.Element {
  return <View className="my-2 h-0.5 rounded-full bg-ink opacity-10" />;
}
