import { router } from "expo-router";
import type { JSX } from "react";
import { View } from "react-native";

import { BatteryCard } from "@/components/BatteryCard";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Row } from "@/components/ui/row";
import { SectionTitle } from "@/components/ui/section-title";
import { Segmented } from "@/components/ui/segmented";
import { Separator } from "@/components/ui/separator";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { qwatch } from "@/lib/ble/client";
import { clock } from "@/lib/format";
import type { TimeWindow } from "@/lib/protocol/commands";
import { band } from "@/lib/store/band";

const HR_INTERVALS = [5, 10, 15, 30, 60] as const;
const SEDENTARY_CYCLES = [30, 60, 90] as const;
const ALL_DAYS = 0x7f;
const HALF_HOUR = 30;

const formatMinutes = (m: number): string => clock(Math.floor(m / 60), m % 60);

function WindowEditor<Window extends TimeWindow>({
  value,
  onChange,
}: {
  value: Window;
  onChange: (next: Window) => void;
}): JSX.Element {
  const toMinutes = (hour: number, minute: number): number =>
    hour * 60 + minute;
  return (
    <>
      <Row label="From">
        <Stepper
          label="start time"
          value={toMinutes(value.startHour, value.startMinute)}
          step={HALF_HOUR}
          min={0}
          max={1410}
          format={formatMinutes}
          onChange={(m) =>
            onChange({
              ...value,
              startHour: Math.floor(m / 60),
              startMinute: m % 60,
            })
          }
        />
      </Row>
      <Row label="To">
        <Stepper
          label="end time"
          value={toMinutes(value.endHour, value.endMinute)}
          step={HALF_HOUR}
          min={0}
          max={1410}
          format={formatMinutes}
          onChange={(m) =>
            onChange({
              ...value,
              endHour: Math.floor(m / 60),
              endMinute: m % 60,
            })
          }
        />
      </Row>
    </>
  );
}

function Loading(): JSX.Element {
  return <Text className="text-sm text-muted">Reading from band…</Text>;
}

export default function BandScreen(): JSX.Element {
  const status = band.useSelector((s) => s.status);
  const device = band.useSelector((s) => s.device);
  const settings = band.useSelector((s) => s.settings);
  const capabilities = band.useSelector((s) => s.capabilities);

  if (status !== "connected" || !device) {
    return (
      <Screen title="Band" subtitle="Settings live on the band itself.">
        <Card tone="lilac">
          <Text weight="bold" className="text-lg">
            Connect your band to change its settings.
          </Text>
          <View className="mt-4">
            <Button
              label="Connect a band"
              icon="search"
              onPress={() => router.push("/connect")}
            />
          </View>
        </Card>
      </Screen>
    );
  }

  const hr = settings.heartRate;
  const format = settings.displayFormat;
  const wake = settings.raiseToWake;
  const dnd = settings.doNotDisturb;
  const sedentary = settings.sedentary;
  const goals = settings.goals;

  return (
    <Screen
      title="Band"
      subtitle={device.name}
      action={
        <Button
          label="Reload"
          icon="rotate-ccw"
          tone="paper"
          size="sm"
          onPress={() => void qwatch.readAllSettings()}
        />
      }
    >
      <BatteryCard />

      <SectionTitle>Health monitoring</SectionTitle>
      <Card tone="peach">
        {hr ? (
          <>
            <Row
              label="Interval heart rate"
              hint="Band measures on its own through the day"
            >
              <Switch
                label="Interval heart rate"
                value={hr.enabled}
                disabled={!capabilities.heartRate}
                onChange={(enabled) =>
                  void qwatch.setHeartRateSettings({ ...hr, enabled })
                }
              />
            </Row>
            {hr.enabled ? (
              <View className="gap-2 pb-2">
                <Text className="text-sm text-muted">Every</Text>
                <Segmented
                  options={HR_INTERVALS}
                  value={
                    HR_INTERVALS.find((m) => m === hr.intervalMinutes) ?? null
                  }
                  format={(m) => `${m} min`}
                  onChange={(intervalMinutes) =>
                    void qwatch.setHeartRateSettings({ ...hr, intervalMinutes })
                  }
                />
              </View>
            ) : null}
            <Separator />
            <Row label="High heart rate alert" hint="Vibrates above this">
              <Stepper
                label="high alert"
                value={hr.highAlert || 120}
                step={5}
                min={60}
                max={200}
                format={(v) => `${v}`}
                onChange={(highAlert) =>
                  void qwatch.setHeartRateSettings({ ...hr, highAlert })
                }
              />
            </Row>
          </>
        ) : (
          <Loading />
        )}
        <Separator />
        {settings.spo2Enabled === null ? (
          <Loading />
        ) : (
          <Row label="All-day blood oxygen" hint="Hourly SpO2 samples">
            <Switch
              label="All-day blood oxygen"
              value={settings.spo2Enabled}
              disabled={!capabilities.spo2}
              onChange={(enabled) => void qwatch.setSpo2Enabled(enabled)}
            />
          </Row>
        )}
      </Card>

      <SectionTitle>Goals</SectionTitle>
      <Card tone="mint">
        {goals ? (
          <>
            <Row label="Steps">
              <Stepper
                label="step goal"
                value={goals.steps}
                step={500}
                min={1000}
                max={50000}
                format={(v) => v.toLocaleString()}
                onChange={(steps) => void qwatch.setGoals({ ...goals, steps })}
              />
            </Row>
            <Row label="Calories">
              <Stepper
                label="calorie goal"
                value={Math.round(goals.calories / 1000)}
                step={50}
                min={50}
                max={5000}
                format={(v) => `${v} kcal`}
                onChange={(kcal) =>
                  void qwatch.setGoals({ ...goals, calories: kcal * 1000 })
                }
              />
            </Row>
            <Row label="Distance">
              <Stepper
                label="distance goal"
                value={goals.meters}
                step={500}
                min={500}
                max={50000}
                format={(v) => `${(v / 1000).toFixed(1)} km`}
                onChange={(meters) =>
                  void qwatch.setGoals({ ...goals, meters })
                }
              />
            </Row>
            <Row label="Active time">
              <Stepper
                label="active goal"
                value={goals.activeMinutes}
                step={5}
                min={5}
                max={600}
                format={(v) => `${v} min`}
                onChange={(activeMinutes) =>
                  void qwatch.setGoals({ ...goals, activeMinutes })
                }
              />
            </Row>
          </>
        ) : (
          <Loading />
        )}
      </Card>

      <SectionTitle>Display</SectionTitle>
      <Card tone="sky">
        {format ? (
          <>
            <Row label="24-hour clock">
              <Switch
                label="24-hour clock"
                value={format.is24Hour}
                onChange={(is24Hour) =>
                  void qwatch.setDisplayFormat({ ...format, is24Hour })
                }
              />
            </Row>
            <Row label="Metric units" hint="Kilometres instead of miles">
              <Switch
                label="Metric units"
                value={format.metric}
                onChange={(metric) =>
                  void qwatch.setDisplayFormat({ ...format, metric })
                }
              />
            </Row>
          </>
        ) : (
          <Loading />
        )}
        <Separator />
        {wake ? (
          <>
            <Row label="Raise to wake">
              <Switch
                label="Raise to wake"
                value={wake.enabled}
                onChange={(enabled) =>
                  void qwatch.setRaiseToWake({ ...wake, enabled })
                }
              />
            </Row>
            <Row label="Worn on">
              <Segmented
                options={["left", "right"] as const}
                value={wake.leftWrist ? "left" : "right"}
                onChange={(side) =>
                  void qwatch.setRaiseToWake({
                    ...wake,
                    leftWrist: side === "left",
                  })
                }
              />
            </Row>
          </>
        ) : (
          <Loading />
        )}
      </Card>

      <SectionTitle>Quiet time</SectionTitle>
      <Card tone="lilac">
        {dnd ? (
          <>
            <Row label="Do not disturb" hint="No vibrations in this window">
              <Switch
                label="Do not disturb"
                value={dnd.enabled}
                onChange={(enabled) =>
                  void qwatch.setDoNotDisturb({ ...dnd, enabled })
                }
              />
            </Row>
            {dnd.enabled ? (
              <WindowEditor
                value={dnd}
                onChange={(next) => void qwatch.setDoNotDisturb(next)}
              />
            ) : null}
          </>
        ) : (
          <Loading />
        )}
        <Separator />
        {sedentary ? (
          <>
            <Row label="Move reminder" hint="Nudges you after sitting still">
              <Switch
                label="Move reminder"
                value={sedentary.weekMask !== 0}
                onChange={(on) =>
                  void qwatch.setSedentary({
                    ...sedentary,
                    weekMask: on ? ALL_DAYS : 0,
                  })
                }
              />
            </Row>
            {sedentary.weekMask !== 0 ? (
              <>
                <View className="gap-2 pb-2">
                  <Text className="text-sm text-muted">After sitting for</Text>
                  <Segmented
                    options={SEDENTARY_CYCLES}
                    value={
                      SEDENTARY_CYCLES.find(
                        (m) => m === sedentary.cycleMinutes,
                      ) ?? null
                    }
                    format={(m) => `${m} min`}
                    onChange={(cycleMinutes) =>
                      void qwatch.setSedentary({ ...sedentary, cycleMinutes })
                    }
                  />
                </View>
                <WindowEditor
                  value={sedentary}
                  onChange={(next) => void qwatch.setSedentary(next)}
                />
              </>
            ) : null}
          </>
        ) : (
          <Loading />
        )}
      </Card>

      <SectionTitle>Device</SectionTitle>
      <Card>
        <Row label="Firmware">
          <Text weight="bold">{device.firmware || "—"}</Text>
        </Row>
        <Row label="Hardware">
          <Text weight="bold">{device.hardware || "—"}</Text>
        </Row>
        <View className="mt-3 gap-2">
          <Button
            label="Sync time to phone"
            icon="clock"
            tone="sky"
            onPress={() => void qwatch.syncTime()}
          />
          <Button
            label="Disconnect"
            icon="bluetooth"
            tone="paper"
            onPress={() => void qwatch.disconnect()}
          />
          <Button
            label="Forget this band"
            icon="trash-2"
            tone="rose"
            onPress={() => void qwatch.forget()}
          />
        </View>
      </Card>
    </Screen>
  );
}
