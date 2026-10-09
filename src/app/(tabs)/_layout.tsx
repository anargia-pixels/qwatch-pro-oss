import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import type { JSX } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedView } from "@/components/ui/animated";
import {
  PressableSurface,
  type PressableSurfaceProps,
} from "@/components/ui/pressable-surface";
import { Text } from "@/components/ui/text";
import { useSelectionStyle } from "@/lib/motion";

type TabButtonProps = Omit<PressableSurfaceProps, "children"> & {
  isFocused?: boolean;
  label: string;
};

/**
 * `TabTrigger asChild` injects its own row / space-between style, which
 * PressableSurface replaces; the inner view does the centring regardless.
 */
function TabButton({
  isFocused = false,
  label,
  ...props
}: TabButtonProps): JSX.Element {
  const indicator = useSelectionStyle(isFocused);
  return (
    <PressableSurface
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      className="flex-1"
    >
      <View className="h-12 items-center justify-center">
        <AnimatedView
          className="absolute inset-0 rounded-2xl border-2 border-ink bg-butter"
          style={indicator}
        />
        <Text weight="bold" className="text-center text-base">
          {label}
        </Text>
      </View>
    </PressableSurface>
  );
}

export default function TabsLayout(): JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <Tabs className="flex-1 bg-cream">
      <TabSlot />
      {/* TabList must be a direct child of Tabs so its triggers register as screens. */}
      <TabList
        className="absolute inset-x-4 flex-row gap-1 rounded-3xl border-2 border-ink bg-paper p-1.5 shadow-brutal"
        style={{ bottom: insets.bottom + 12 }}
      >
        <TabTrigger name="index" href="/" asChild>
          <TabButton label="Today" />
        </TabTrigger>
        <TabTrigger name="band" href="/band" asChild>
          <TabButton label="Band" />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton label="Settings" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}
