import type { JSX } from "react";
import { View } from "react-native";
import { useAnimatedStyle } from "react-native-reanimated";

import { springs, useSpringTo } from "@/lib/motion";
import { toneClass, type Tone } from "@/lib/theme";

import { AnimatedView } from "./ui/animated";
import { Text } from "./ui/text";

export type HourBar = { hour: number; low: number; high: number };

/** Per-hour entrance delay, so a fresh chart grows in left to right. */
const STAGGER_MS = 14;

/** One bar rising from the baseline to `bottom..bottom+height` (both in %). */
function Bar({
  hour,
  height,
  bottom,
  tone,
}: {
  hour: number;
  height: number;
  bottom: number;
  tone: Tone;
}): JSX.Element {
  const options = { from: 0, enterDelayMs: hour * STAGGER_MS };
  const size = useSpringTo(height, springs.slowSpatial, options);
  const lift = useSpringTo(bottom, springs.slowSpatial, options);
  const barStyle = useAnimatedStyle(() => ({ height: `${size.get()}%` }));
  const gapStyle = useAnimatedStyle(() => ({ height: `${lift.get()}%` }));
  return (
    <View className="h-full flex-1 justify-end">
      <AnimatedView
        className={`rounded-full border-2 border-ink ${toneClass[tone]}`}
        style={barStyle}
      />
      <AnimatedView style={gapStyle} />
    </View>
  );
}

/**
 * 24 rounded bars for one day; each bar spans `low..high` within
 * `floor..ceiling`. `ticks` are labelled on the y axis and drawn as gridlines.
 */
export function HourlyChart({
  bars,
  floor,
  ceiling,
  ticks,
  tone,
  emptyLabel,
}: {
  bars: readonly HourBar[];
  floor: number;
  ceiling: number;
  ticks: readonly number[];
  tone: Tone;
  emptyLabel: string;
}): JSX.Element {
  if (bars.length === 0) {
    return (
      <View className="h-28 items-center justify-center rounded-2xl border-2 border-dashed border-ink">
        <Text className="text-sm text-muted">{emptyLabel}</Text>
      </View>
    );
  }
  const byHour = new Map(bars.map((bar) => [bar.hour, bar]));
  const span = Math.max(1, ceiling - floor);
  const scale = (value: number): number =>
    Math.min(1, Math.max(0, (value - floor) / span));

  return (
    <View className="gap-1">
      <View className="flex-row gap-1">
        {/* Inset by the chart's border + padding so labels line up with the gridlines. */}
        <View className="w-7">
          <View className="absolute inset-x-0 top-2 bottom-2">
            {ticks.map((tick) => (
              <View
                key={tick}
                className="absolute right-0"
                style={{
                  bottom: `${scale(tick) * 100}%`,
                  transform: [{ translateY: 6 }],
                }}
              >
                <Text className="text-[10px] leading-3 text-muted">{tick}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className="h-28 flex-1 flex-row items-end gap-0.5 rounded-2xl border-2 border-ink bg-cream px-1.5 py-1.5">
          <View
            className="absolute inset-x-0 top-1.5 bottom-1.5"
            pointerEvents="none"
          >
            {ticks.map((tick) => (
              <View
                key={tick}
                className="absolute inset-x-0 h-px bg-ink/15"
                style={{ bottom: `${scale(tick) * 100}%` }}
              />
            ))}
          </View>
          {Array.from({ length: 24 }, (_, hour) => {
            const bar = byHour.get(hour);
            if (!bar) return <View key={hour} className="flex-1" />;
            const height = Math.min(
              100,
              Math.max(8, (scale(bar.high) - scale(bar.low)) * 100),
            );
            const bottom = Math.min(scale(bar.low) * 100, 100 - height);
            return (
              <Bar
                key={hour}
                hour={hour}
                height={height}
                bottom={bottom}
                tone={tone}
              />
            );
          })}
        </View>
      </View>
      <View className="flex-row justify-between pl-9 pr-1">
        {["0h", "6h", "12h", "18h", "24h"].map((label) => (
          <Text key={label} className="text-[10px] text-muted">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
