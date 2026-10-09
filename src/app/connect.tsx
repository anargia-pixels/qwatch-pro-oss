import { router, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import type { JSX } from "react";
import { View } from "react-native";
import { FadeInDown, LinearTransition } from "react-native-reanimated";

import { Screen } from "@/components/Screen";
import { AnimatedView } from "@/components/ui/animated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PressableSurface } from "@/components/ui/pressable-surface";
import { Row } from "@/components/ui/row";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { qwatch } from "@/lib/ble/client";
import { springs } from "@/lib/motion";
import { band, type ScanResult } from "@/lib/store/band";
import { cn } from "@/lib/utils";

const BAR_HEIGHTS = ["h-1.5", "h-2.5", "h-3.5", "h-4.5"] as const;

/** 1–4 bars, roughly like the vendor's signal icon. */
function signalLevel(rssi: number): number {
  if (rssi > -60) return 4;
  if (rssi > -70) return 3;
  if (rssi > -80) return 2;
  return 1;
}

function SignalBars({ rssi }: { rssi: number | null }): JSX.Element {
  if (rssi === null) return <Badge label="paired" tone="mint" icon="link" />;
  const level = signalLevel(rssi);
  return (
    <View className="items-end gap-1">
      <View className="h-4.5 flex-row items-end gap-0.5">
        {BAR_HEIGHTS.map((height, index) => (
          <View
            key={height}
            className={cn(
              "w-1.5 rounded-full border border-ink",
              height,
              index < level ? "bg-ink" : "bg-paper",
            )}
          />
        ))}
      </View>
      <Text className="text-xs text-muted">{`${rssi} dBm`}</Text>
    </View>
  );
}

const PULSE = {
  from: { transform: [{ scale: 0.35 }], opacity: 0.9 },
  to: { transform: [{ scale: 1 }], opacity: 0 },
};

/** Concentric rings around the band icon; the rings pulse while scanning. */
function Radar({ active }: { active: boolean }): JSX.Element {
  return (
    <View className="h-44 items-center justify-center">
      <View className="absolute h-44 w-44 rounded-full border-2 border-ink opacity-15" />
      <View className="absolute h-30 w-30 rounded-full border-2 border-ink opacity-25" />
      {active
        ? [0, 1].map((delay) => (
            <AnimatedView
              key={delay}
              className="absolute h-44 w-44 rounded-full border-2 border-ink bg-sky"
              style={{
                animationName: PULSE,
                animationDuration: "2400ms",
                animationDelay: `${delay * 1200}ms`,
                animationIterationCount: "infinite",
                animationTimingFunction: "ease-out",
              }}
            />
          ))
        : null}
      <View className="h-16 w-16 items-center justify-center rounded-3xl border-2 border-ink bg-butter shadow-brutal-md">
        <Icon name="watch" size={28} />
      </View>
    </View>
  );
}

/** New rows slide up into place; existing rows glide when the list re-sorts by signal. */
const ROW_ENTER = FadeInDown.springify()
  .damping(springs.defaultSpatial.damping ?? 0)
  .stiffness(springs.defaultSpatial.stiffness ?? 0);
const ROW_LAYOUT = LinearTransition.springify()
  .damping(springs.defaultSpatial.damping ?? 0)
  .stiffness(springs.defaultSpatial.stiffness ?? 0);

function ResultRow({
  result,
  disabled,
  onPress,
}: {
  result: ScanResult;
  disabled: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <PressableSurface
      depth="lg"
      radius={[24, 18]}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${result.name}`}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-3 rounded-3xl border-2 border-ink p-4",
        result.likelyBand ? "bg-paper" : "bg-cream",
        disabled && "opacity-50",
      )}
    >
      <View
        className={cn(
          "h-11 w-11 items-center justify-center rounded-2xl border-2 border-ink",
          result.likelyBand ? "bg-mint" : "bg-paper",
        )}
      >
        <Icon name={result.likelyBand ? "watch" : "bluetooth"} size={20} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="bold" className="text-lg" numberOfLines={1}>
          {result.name}
        </Text>
        <Text className="text-xs text-muted">{result.id}</Text>
      </View>
      <SignalBars rssi={result.rssi} />
    </PressableSurface>
  );
}

export default function ConnectScreen(): JSX.Element {
  const status = band.useSelector((s) => s.status);
  const results = band.useSelector((s) => s.scanResults);
  const error = band.useSelector((s) => s.error);
  const [showAll, setShowAll] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    void qwatch.scan();
    return () => qwatch.stopScan();
  }, []);

  /** Closes only after a connect started here succeeds, and only if this screen is still on top. */
  const connect = async (id: string): Promise<void> => {
    await qwatch.connect(id);
    if (band.get().status === "connected" && navigation.isFocused()) {
      router.back();
    }
  };

  const scanning = status === "scanning";
  const bands = results.filter((result) => result.likelyBand);
  const visible = showAll ? results : bands;
  const hidden = results.length - bands.length;

  return (
    <Screen
      title="Find band"
      subtitle="Wake the band and keep it next to your phone."
      action={
        <Button
          label="Close"
          icon="x"
          tone="paper"
          size="sm"
          onPress={() => router.back()}
        />
      }
    >
      <Card tone="lilac">
        <Radar active={scanning} />
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text weight="bold" className="text-lg">
              {scanning ? "Scanning…" : "Scan finished"}
            </Text>
            <Text className="text-sm">
              {`${bands.length} ${bands.length === 1 ? "band" : "bands"} found`}
            </Text>
          </View>
          <Button
            label={scanning ? "Stop" : "Scan again"}
            icon={scanning ? "square" : "refresh-cw"}
            size="sm"
            onPress={() => (scanning ? qwatch.stopScan() : void qwatch.scan())}
          />
        </View>
        {error ? <Text className="mt-2 text-sm">⚠ {error}</Text> : null}
      </Card>

      <Card>
        <Row
          label="Show all Bluetooth devices"
          hint={
            hidden > 0
              ? `${hidden} other ${hidden === 1 ? "device" : "devices"} nearby`
              : "Only bands that match the QWatch filter are listed"
          }
        >
          <Switch
            label="Show all Bluetooth devices"
            value={showAll}
            onChange={setShowAll}
          />
        </Row>
      </Card>

      {visible.length === 0 ? (
        <Text className="text-center text-muted">
          {scanning
            ? "Nothing yet. Tap the band's screen to wake it up."
            : "Nothing found. Make sure the band is charged and not connected to another phone."}
        </Text>
      ) : null}

      {visible.map((result) => (
        <AnimatedView key={result.id} entering={ROW_ENTER} layout={ROW_LAYOUT}>
          <ResultRow
            result={result}
            disabled={status === "connecting"}
            onPress={() => void connect(result.id)}
          />
        </AnimatedView>
      ))}

      {status === "connecting" ? (
        <Text weight="medium" className="text-center">
          Connecting and syncing…
        </Text>
      ) : null}
    </Screen>
  );
}
