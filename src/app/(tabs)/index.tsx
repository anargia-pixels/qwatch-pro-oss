import { useEffect, useState, type JSX } from "react";
import { View } from "react-native";

import { BatteryCard } from "@/components/BatteryCard";
import { ConnectionCard } from "@/components/ConnectionCard";
import { HourlyChart } from "@/components/HourlyChart";
import { Screen } from "@/components/Screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { SectionTitle } from "@/components/ui/section-title";
import { Text } from "@/components/ui/text";
import { qwatch } from "@/lib/ble/client";
import { formatDistance, heartRateBars, spo2Bars, timeAgo } from "@/lib/format";
import {
  band,
  currentHeartRate,
  currentSpo2,
  type Reading,
} from "@/lib/store/band";
import type { Tone } from "@/lib/theme";

const SOURCE_LABEL = {
  manual: "measured",
  live: "live",
  history: "auto",
} as const;

function ReadingCard({
  title,
  unit,
  icon,
  tone,
  reading,
  measuring,
  onMeasure,
  children,
}: {
  title: string;
  unit: string;
  icon: "heart" | "droplet";
  tone: Tone;
  reading: Reading | null;
  measuring: boolean;
  onMeasure: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const connected = band.useSelector((s) => s.status === "connected");
  return (
    <Card tone={tone}>
      <CardHeader icon={icon} title={title}>
        {reading ? <Badge label={SOURCE_LABEL[reading.source]} /> : null}
      </CardHeader>
      <View className="mt-3 flex-row items-end gap-2">
        <Text weight="bold" className="text-6xl leading-none">
          {reading ? String(reading.value) : "--"}
        </Text>
        <Text weight="bold" className="mb-2 text-xl">
          {unit}
        </Text>
      </View>
      <Text className="text-sm text-muted">
        {reading ? timeAgo(reading.measuredAt) : "No recent reading"}
      </Text>
      <View className="mt-4 gap-3">
        <Button
          label={measuring ? "Measuring… keep still" : "Measure now"}
          icon="zap"
          tone="paper"
          busy={measuring}
          disabled={!connected}
          onPress={onMeasure}
        />
        {children}
      </View>
    </Card>
  );
}

/** Re-renders every 30 s so "x min ago" and a reading's staleness keep up between band updates. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function TodayScreen(): JSX.Element {
  const now = useNow();
  const heartRate = band.useSelector((s) => currentHeartRate(s, now));
  const spo2 = band.useSelector((s) => currentSpo2(s, now));
  const measuring = band.useSelector((s) => s.measuring);
  const live = band.useSelector((s) => s.liveHeartRate);
  const activity = band.useSelector((s) => s.activity);
  const goals = band.useSelector((s) => s.settings.goals);
  const format = band.useSelector((s) => s.settings.displayFormat);
  const hrHistory = band.useSelector((s) => s.heartRateHistory);
  const spo2History = band.useSelector((s) => s.spo2History);
  const connected = band.useSelector((s) => s.status === "connected");

  const stepGoal = goals?.steps ?? 0;
  const progress =
    stepGoal > 0 && activity ? Math.min(1, activity.steps / stepGoal) : 0;
  const metric = format?.metric ?? true;

  return (
    <Screen title="Today" subtitle={new Date().toDateString()}>
      <ConnectionCard />
      {connected ? <BatteryCard /> : null}

      <Card tone="mint">
        <View className="flex-row items-center gap-3">
          <IconBadge icon="trending-up" tone="paper" />
          <Text weight="bold" className="flex-1 text-lg">
            Steps
          </Text>
          {stepGoal > 0 ? (
            <Badge label={`goal ${stepGoal.toLocaleString()}`} />
          ) : null}
        </View>
        <Text weight="bold" className="mt-3 text-6xl leading-none">
          {activity ? activity.steps.toLocaleString() : "--"}
        </Text>
        <View className="mt-3 h-5 overflow-hidden rounded-sm border-2 border-ink bg-paper">
          <View
            className="h-full rounded-sm bg-ink"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
        <View className="mt-4 flex-row gap-2">
          <Stat
            label="Distance"
            value={activity ? formatDistance(activity.meters, metric) : "--"}
          />
          <Stat
            label="Calories"
            value={
              activity ? `${Math.round(activity.calories / 1000)} kcal` : "--"
            }
          />
          <Stat
            label="Active"
            value={activity ? `${activity.activeMinutes} min` : "--"}
          />
        </View>
      </Card>

      <ReadingCard
        title="Heart rate"
        unit="bpm"
        icon="heart"
        tone="peach"
        reading={heartRate}
        measuring={measuring === "heartRate"}
        onMeasure={() => void qwatch.measure("heartRate")}
      >
        <Button
          label={live ? "Stop live heart rate" : "Start live heart rate"}
          icon={live ? "pause" : "radio"}
          tone={live ? "rose" : "butter"}
          disabled={!connected || measuring !== null}
          onPress={() => void (live ? qwatch.stopLive() : qwatch.startLive())}
        />
      </ReadingCard>

      <ReadingCard
        title="Blood oxygen"
        unit="%"
        icon="droplet"
        tone="sky"
        reading={spo2}
        measuring={measuring === "spo2"}
        onMeasure={() => void qwatch.measure("spo2")}
      />

      <SectionTitle>History</SectionTitle>
      <Card>
        <Text weight="bold" className="mb-3 text-base">
          Heart rate today (bpm)
        </Text>
        <HourlyChart
          bars={heartRateBars(hrHistory)}
          floor={40}
          ceiling={200}
          ticks={[40, 80, 120, 160, 200]}
          tone="peach"
          emptyLabel="Turn on interval heart rate in Band"
        />
      </Card>
      <Card>
        <Text weight="bold" className="mb-3 text-base">
          Blood oxygen today (%)
        </Text>
        <HourlyChart
          bars={spo2Bars(spo2History)}
          floor={85}
          ceiling={100}
          ticks={[85, 90, 95, 100]}
          tone="sky"
          emptyLabel="Turn on all-day SpO2 in Band"
        />
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View className="flex-1 rounded-2xl border-2 border-ink bg-paper px-3 py-2">
      <Text className="text-xs text-muted">{label}</Text>
      <Text weight="bold" className="text-base" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
