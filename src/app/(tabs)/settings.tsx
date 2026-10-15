import Constants from "expo-constants";
import { useState } from "react";
import type { JSX } from "react";
import { View } from "react-native";

import { Screen } from "@/components/Screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Row } from "@/components/ui/row";
import { SectionTitle } from "@/components/ui/section-title";
import { Segmented } from "@/components/ui/segmented";
import { Separator } from "@/components/ui/separator";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { requestAlertPermission } from "@/lib/alerts/alerts";
import { timeAgo } from "@/lib/format";
import {
  HEART_RATE_HIGH_LIMITS,
  HEART_RATE_LOW_LIMITS,
  MIN_UPLOAD_INTERVAL_SECONDS,
  SPO2_LOW_LIMITS,
  appSettings,
  saveAppSettings,
  toIntervalSeconds,
} from "@/lib/store/appSettings";
import { buildPayload, uploadNow } from "@/lib/upload/uploader";

const PRESETS = [30, 60, 300, 900] as const;

const formatSeconds = (s: number): string =>
  s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;

function BackgroundSettings(): JSX.Element {
  const loaded = appSettings.useSelector((s) => s.loaded);
  const background = appSettings.useSelector((s) => s.backgroundEnabled);
  const alerts = appSettings.useSelector((s) => s.alertsEnabled);
  const heartRateLow = appSettings.useSelector((s) => s.heartRateLow);
  const heartRateHigh = appSettings.useSelector((s) => s.heartRateHigh);
  const spo2Low = appSettings.useSelector((s) => s.spo2Low);
  const [denied, setDenied] = useState(false);

  const toggleAlerts = async (next: boolean): Promise<void> => {
    if (next && !(await requestAlertPermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    await saveAppSettings({ alertsEnabled: next });
  };

  return (
    <>
      <SectionTitle>Background</SectionTitle>
      <Card>
        <Row
          label="Stay connected"
          hint={
            background
              ? "Keeps the band linked when the app is closed, like a watch app"
              : "The band disconnects when Android closes the app"
          }
        >
          <Switch
            label="Stay connected"
            value={background}
            disabled={!loaded}
            onChange={(next) =>
              void saveAppSettings({ backgroundEnabled: next })
            }
          />
        </Row>
      </Card>

      <SectionTitle>Alerts</SectionTitle>
      <Card tone="rose">
        <Row
          label="Reading alerts"
          hint="Notify me when a reading goes outside these limits"
        >
          <Switch
            label="Reading alerts"
            value={alerts}
            disabled={!loaded}
            onChange={(next) => void toggleAlerts(next)}
          />
        </Row>
        {denied ? (
          <Text className="text-sm">
            ⚠ Allow notifications for this app in system settings first.
          </Text>
        ) : null}
        <Separator />
        <Row label="Heart rate below">
          <Stepper
            label="low heart rate alert"
            value={heartRateLow}
            step={5}
            min={HEART_RATE_LOW_LIMITS.min}
            max={HEART_RATE_LOW_LIMITS.max}
            format={(v) => `${v} bpm`}
            onChange={(v) => void saveAppSettings({ heartRateLow: v })}
          />
        </Row>
        <Row
          label="High heart rate"
          hint={
            heartRateHigh === null
              ? "Off, so workouts don't notify you"
              : "Notify me when heart rate goes above"
          }
        >
          <Switch
            label="High heart rate alert"
            value={heartRateHigh !== null}
            disabled={!loaded}
            onChange={(next) =>
              void saveAppSettings({
                heartRateHigh: next ? HEART_RATE_HIGH_LIMITS.initial : null,
              })
            }
          />
        </Row>
        {heartRateHigh === null ? null : (
          <Row label="Heart rate above">
            <Stepper
              label="high heart rate alert"
              value={heartRateHigh}
              step={5}
              min={HEART_RATE_HIGH_LIMITS.min}
              max={HEART_RATE_HIGH_LIMITS.max}
              format={(v) => `${v} bpm`}
              onChange={(v) => void saveAppSettings({ heartRateHigh: v })}
            />
          </Row>
        )}
        <Row label="Blood oxygen below">
          <Stepper
            label="blood oxygen alert"
            value={spo2Low}
            step={1}
            min={SPO2_LOW_LIMITS.min}
            max={SPO2_LOW_LIMITS.max}
            format={(v) => `${v}%`}
            onChange={(v) => void saveAppSettings({ spo2Low: v })}
          />
        </Row>
        <Text className="mt-1 text-xs text-muted">
          At most one alert per limit every 30 minutes.
        </Text>
      </Card>
    </>
  );
}

export default function SettingsScreen(): JSX.Element {
  const loaded = appSettings.useSelector((s) => s.loaded);
  const enabled = appSettings.useSelector((s) => s.uploadEnabled);
  const savedUrl = appSettings.useSelector((s) => s.serverUrl);
  const savedToken = appSettings.useSelector((s) => s.authToken);
  const savedInterval = appSettings.useSelector((s) => s.intervalSeconds);
  const lastUpload = appSettings.useSelector((s) => s.lastUpload);

  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [intervalText, setIntervalText] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const draftUrl = url ?? savedUrl;
  const draftToken = token ?? savedToken;
  const draftInterval = intervalText ?? String(savedInterval);
  const dirty = url !== null || token !== null || intervalText !== null;
  const validUrl = /^https?:\/\/\S+$/i.test(draftUrl.trim());

  const save = async (): Promise<void> => {
    await saveAppSettings({
      serverUrl: draftUrl.trim(),
      authToken: draftToken.trim(),
      intervalSeconds: toIntervalSeconds(draftInterval),
    });
    setUrl(null);
    setToken(null);
    setIntervalText(null);
  };

  const test = async (): Promise<void> => {
    setTesting(true);
    if (dirty) await save();
    await uploadNow();
    setTesting(false);
  };

  return (
    <Screen title="Settings" subtitle="Background, alerts and uploads.">
      <BackgroundSettings />

      <SectionTitle>Upload</SectionTitle>
      <Card tone="lilac">
        <Row
          label="Upload to server"
          hint={
            enabled
              ? `POST every ${formatSeconds(savedInterval)}, also in the background`
              : "Off — nothing leaves your phone"
          }
        >
          <Switch
            label="Upload to server"
            value={enabled}
            disabled={!loaded || (!enabled && !savedUrl)}
            onChange={(next) => void saveAppSettings({ uploadEnabled: next })}
          />
        </Row>
        {!savedUrl ? (
          <Text className="text-xs text-muted">
            Save a server URL first to switch this on.
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Server</SectionTitle>
      <Card>
        <View className="gap-4">
          <Input
            label="Endpoint URL"
            placeholder="https://example.com/qwatch"
            keyboardType="url"
            value={draftUrl}
            onChangeText={setUrl}
          />
          <Input
            label="Bearer token (optional)"
            placeholder="Sent as Authorization: Bearer …"
            secureTextEntry
            value={draftToken}
            onChangeText={setToken}
          />
          <View className="gap-2">
            <Input
              label={`Interval in seconds (min ${MIN_UPLOAD_INTERVAL_SECONDS})`}
              keyboardType="number-pad"
              value={draftInterval}
              onChangeText={setIntervalText}
            />
            <Segmented
              options={PRESETS}
              value={PRESETS.find((p) => String(p) === draftInterval) ?? null}
              format={formatSeconds}
              onChange={(p) => setIntervalText(String(p))}
            />
          </View>
          {!validUrl && draftUrl.length > 0 ? (
            <Text className="text-sm">
              ⚠ URL must start with http:// or https://
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label="Save"
                icon="save"
                tone="mint"
                disabled={!dirty || (draftUrl.length > 0 && !validUrl)}
                onPress={() => void save()}
              />
            </View>
            <View className="flex-1">
              <Button
                label="Send test"
                icon="send"
                tone="sky"
                busy={testing}
                disabled={!validUrl}
                onPress={() => void test()}
              />
            </View>
          </View>
        </View>
      </Card>

      <SectionTitle>Last upload</SectionTitle>
      <Card
        tone={lastUpload === null ? "paper" : lastUpload.ok ? "mint" : "rose"}
      >
        {lastUpload ? (
          <View className="flex-row items-center justify-between">
            <View>
              <Text weight="bold" className="text-lg">
                {lastUpload.ok ? "Delivered" : "Failed"}
              </Text>
              <Text className="text-sm text-muted">
                {timeAgo(lastUpload.at)}
              </Text>
            </View>
            <Badge label={lastUpload.message} />
          </View>
        ) : (
          <Text className="text-muted">Nothing sent yet.</Text>
        )}
      </Card>

      <Card>
        <Row label="Payload preview" hint="Exactly what gets POSTed as JSON">
          <Button
            label={showPayload ? "Hide" : "Show"}
            size="sm"
            tone="paper"
            onPress={() => setShowPayload(!showPayload)}
          />
        </Row>
        {showPayload ? (
          <View className="mt-2 rounded-2xl border-2 border-ink bg-cream p-3">
            <Text className="text-xs">
              {JSON.stringify(buildPayload(), null, 2)}
            </Text>
          </View>
        ) : null}
      </Card>

      <Text className="text-center text-xs text-muted">
        QWatch OSS {Constants.expoConfig?.version ?? ""} · Apache-2.0
      </Text>
    </Screen>
  );
}
