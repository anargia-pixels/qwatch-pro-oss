import type { JSX } from "react";
import { View } from "react-native";
import { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { timeAgo } from "@/lib/format";
import { springs, useSpringTo } from "@/lib/motion";
import { band, batteryDrainPerHour } from "@/lib/store/band";

import { AnimatedView } from "./ui/animated";
import { Badge } from "./ui/badge";
import { Card, CardHeader } from "./ui/card";
import { Text } from "./ui/text";

/** One bar per 5 % of charge. */
const SEGMENTS = 20;

/** Turns black as the animated count reaches its bar, so the bars fill in with a spring. */
function BatterySegment({
  index,
  count,
}: {
  index: number;
  count: SharedValue<number>;
}): JSX.Element {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, count.get() - index)),
  }));
  return (
    <AnimatedView className="h-full flex-1 rounded-sm bg-ink" style={style} />
  );
}

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
  const litCount = Math.round((percent * SEGMENTS) / 100);
  const count = useSpringTo(litCount, springs.slowSpatial, { from: 0 });
  const drain = batteryDrainPerHour(history);
  const lastAt = history.at(-1)?.at ?? null;

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
        <View className="h-full flex-1 flex-row gap-0.5 overflow-hidden rounded-sm border-2 border-ink bg-paper p-0.5">
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <BatterySegment key={index} index={index} count={count} />
          ))}
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
