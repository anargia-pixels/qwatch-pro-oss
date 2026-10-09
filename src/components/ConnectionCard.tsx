import { router } from "expo-router";
import type { JSX } from "react";
import { View } from "react-native";

import { qwatch } from "@/lib/ble/client";
import { band } from "@/lib/store/band";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { IconBadge } from "./ui/icon-badge";
import { Text } from "./ui/text";

const STATUS_LABEL = {
  idle: "Not connected",
  scanning: "Scanning…",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
} as const;

export function ConnectionCard(): JSX.Element {
  const status = band.useSelector((s) => s.status);
  const device = band.useSelector((s) => s.device);
  const battery = band.useSelector((s) => s.battery);
  const error = band.useSelector((s) => s.error);
  const connected = status === "connected";

  return (
    <Card tone={connected ? "mint" : "lilac"}>
      <View className="flex-row items-center gap-3">
        <IconBadge icon={connected ? "bluetooth" : "watch"} tone="paper" />
        <View className="flex-1">
          <Text weight="bold" className="text-lg" numberOfLines={1}>
            {device?.name ?? "No band yet"}
          </Text>
          <Text className="text-sm text-muted">{STATUS_LABEL[status]}</Text>
        </View>
        {battery ? (
          <Badge
            icon={battery.charging ? "battery-charging" : "battery"}
            label={`${battery.percent}%`}
            tone="butter"
          />
        ) : null}
      </View>
      {error ? (
        <Text className="mt-3 text-sm" weight="medium">
          ⚠ {error}
        </Text>
      ) : null}
      <View className="mt-4 flex-row gap-2">
        {connected ? (
          <>
            <View className="flex-1">
              <Button
                label="Refresh"
                icon="refresh-cw"
                tone="paper"
                onPress={() => void qwatch.refresh()}
              />
            </View>
            <View className="flex-1">
              <Button
                label="Find band"
                icon="bell"
                tone="butter"
                onPress={() => void qwatch.findDevice()}
              />
            </View>
          </>
        ) : (
          <View className="flex-1">
            <Button
              label={
                status === "reconnecting"
                  ? "Pick another band"
                  : "Connect a band"
              }
              icon="search"
              busy={status === "connecting"}
              onPress={() => router.push("/connect")}
            />
          </View>
        )}
      </View>
    </Card>
  );
}
