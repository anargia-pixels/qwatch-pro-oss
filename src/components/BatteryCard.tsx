import type { JSX } from "react";
import { View } from "react-native";
import { useAnimatedStyle } from "react-native-reanimated";

import { timeAgo } from "@/lib/format";
import { springs, useSpringTo } from "@/lib/motion";
import { band, batteryDrainPerHour } from "@/lib/store/band";

import { AnimatedView } from "./ui/animated";
import { Badge } from "./ui/badge";
import { Card, CardHeader } from "./ui/card";
import { Text } from "./ui/text";

function usageLabel(drain: number | null, percent: number): string {
  if (drain === null) return "Collecting usage — check back in a bit";
  if (drain < 0.05) return "Barely draining";
  const hoursLeft = percent / drain;
  const left =
    hoursLeft >= 48
      ? `${Math.round(hoursLeft / 24)} days`
      : `${Math.round(hoursLeft)} h`;
  return `${drain.toFixed(1)}%/h · about ${left} left`;
}

export function BatteryCard(): JSX.Element {
  const battery = band.useSelector((s) => s.battery);
  const history = band.useSelector((s) => s.batteryHistory);
  const percent = battery?.percent ?? 0;
  const width = useSpringTo(percent, springs.slowSpatial, { from: 0 });
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.get()}%` }));
  const drain = batteryDrainPerHour(history);
  const lastAt = history.at(-1)?.at ?? null;
  const fill =
    percent > 50 ? "bg-mint" : percent > 20 ? "bg-butter" : "bg-rose";

  return (
    <Card tone="butter">
      <CardHeader
        icon={battery?.charging ? "battery-charging" : "battery"}
        title="Battery"
      >
        {battery?.charging ? (
          <Badge label="charging" tone="mint" icon="zap" />
        ) : null}
      </CardHeader>
      <View className="mt-3 flex-row items-end gap-2">
        <Text weight="bold" className="text-6xl leading-none">
          {battery ? String(percent) : "--"}
        </Text>
        <Text weight="bold" className="mb-2 text-xl">
          %
        </Text>
      </View>
      <View className="mt-3 h-6 flex-row items-center">
        <View className="h-full flex-1 overflow-hidden rounded-xl border-2 border-ink bg-paper p-0.5">
          <AnimatedView
            className={`h-full rounded-lg ${fill}`}
            style={fillStyle}
          />
        </View>
        <View className="ml-0.5 h-3 w-1.5 rounded-r-sm bg-ink" />
      </View>
      <Text weight="medium" className="mt-3 text-sm">
        {battery?.charging ? "On the charger" : usageLabel(drain, percent)}
      </Text>
      <Text className="text-xs text-muted">Updated {timeAgo(lastAt)}</Text>
    </Card>
  );
}
