import type { JSX, ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "./ui/text";

/** Clears the floating tab bar (h-12 buttons, p-1.5, border, 12px gap) plus breathing room. */
const TAB_BAR_CLEARANCE = 112;

/** Scrollable page with a large title; shared by every tab and the scan modal. */
export function Screen({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerClassName="gap-4.5 px-5"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
      }}
    >
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text weight="bold" className="text-4xl">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-base text-muted">{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </ScrollView>
  );
}
