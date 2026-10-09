import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { todayAtMinute } from "@/lib/format";
import type { HeartRateSample, Spo2Hour } from "@/lib/protocol/decoders";
import { appSettings } from "@/lib/store/appSettings";
import { band, type BandState, type Reading } from "@/lib/store/band";

const CHANNEL_ID = "health-alerts";
/** One alert per rule at most this often, so a long dip does not spam. */
const COOLDOWN_MS = 30 * 60_000;
/** Older samples (e.g. yesterday's history on first sync) never alert. */
const MAX_AGE_MS = 60 * 60_000;

type Metric = "heartRate" | "spo2";
type Sample = { value: number; measuredAt: number };
/** Band state fields that carry readings: live values and their history. */
type Source = "heartRate" | "heartRateHistory" | "spo2" | "spo2History";
type Rule = {
  metric: Metric;
  direction: "below" | "above";
  title: string;
  unit: string;
};

/** Keyed by the setting that holds each rule's threshold. */
const RULES = {
  heartRateLow: {
    metric: "heartRate",
    direction: "below",
    title: "Low heart rate",
    unit: "bpm",
  },
  heartRateHigh: {
    metric: "heartRate",
    direction: "above",
    title: "High heart rate",
    unit: "bpm",
  },
  spo2Low: {
    metric: "spo2",
    direction: "below",
    title: "Low blood oxygen",
    unit: "%",
  },
} as const satisfies Record<string, Rule>;

type RuleKey = keyof typeof RULES;
// SAFETY: Object.keys of a literal object returns exactly its keys.
const RULE_KEYS = Object.keys(RULES) as RuleKey[];

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

/** Creates the Android channel and asks for permission; resolves true when alerts can be shown. */
export async function requestAlertPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Health alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

function readingSample(reading: Reading | null): Sample[] {
  return reading
    ? [{ value: reading.value, measuredAt: reading.measuredAt }]
    : [];
}

function heartRateSamples(history: HeartRateSample[]): Sample[] {
  return history.map((sample) => ({
    value: sample.bpm,
    measuredAt: todayAtMinute(sample.minute),
  }));
}

/** Only low SpO2 alerts, so the hour's highest value is used: if even that is low, the whole hour was low. */
function spo2Samples(history: Spo2Hour[]): Sample[] {
  return history.map((hour) => ({
    value: hour.max,
    measuredAt: todayAtMinute(hour.hour * 60),
  }));
}

class AlertWatcher {
  /**
   * Newest sample checked, per source. Live readings and history have their
   * own cursors: a live reading at 14:00 must not hide a 13:40 history
   * sample that only arrives on a later sync.
   */
  private checkedUntil = {
    heartRate: 0,
    heartRateHistory: 0,
    spo2: 0,
    spo2History: 0,
  } satisfies Record<Source, number>;
  private lastAlertAt = {
    heartRateLow: 0,
    heartRateHigh: 0,
    spo2Low: 0,
  } satisfies Record<RuleKey, number>;
  private seen: Pick<BandState, Source> | null = null;

  /** Runs on every band update; cheap unless a reading actually changed. */
  check(state: BandState): void {
    const seen = this.seen;
    this.seen = state;
    if (!appSettings.get().alertsEnabled) return;
    if (seen?.heartRate !== state.heartRate) {
      this.evaluate("heartRate", "heartRate", readingSample(state.heartRate));
    }
    if (seen?.heartRateHistory !== state.heartRateHistory) {
      this.evaluate(
        "heartRate",
        "heartRateHistory",
        heartRateSamples(state.heartRateHistory),
      );
    }
    if (seen?.spo2 !== state.spo2) {
      this.evaluate("spo2", "spo2", readingSample(state.spo2));
    }
    if (seen?.spo2History !== state.spo2History) {
      this.evaluate("spo2", "spo2History", spo2Samples(state.spo2History));
    }
  }

  private evaluate(metric: Metric, source: Source, samples: Sample[]): void {
    const now = Date.now();
    const fresh = samples.filter(
      (sample) =>
        sample.value > 0 &&
        sample.measuredAt > this.checkedUntil[source] &&
        now - sample.measuredAt < MAX_AGE_MS,
    );
    if (fresh.length === 0) return;
    this.checkedUntil[source] = Math.max(...fresh.map((s) => s.measuredAt));
    const values = fresh.map((s) => s.value);
    const settings = appSettings.get();
    for (const key of RULE_KEYS) {
      const rule = RULES[key];
      if (rule.metric !== metric) continue;
      const threshold = settings[key];
      if (threshold === null) continue;
      const extreme =
        rule.direction === "below" ? Math.min(...values) : Math.max(...values);
      const crossed =
        rule.direction === "below" ? extreme < threshold : extreme > threshold;
      if (!crossed || now - this.lastAlertAt[key] < COOLDOWN_MS) continue;
      this.lastAlertAt[key] = now;
      void Notifications.scheduleNotificationAsync({
        content: {
          title: rule.title,
          body: `Your band read ${extreme} ${rule.unit}, ${rule.direction} your ${threshold} ${rule.unit} alert.`,
          sound: true,
        },
        trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
      });
    }
  }
}

/** Watches band readings and posts a local notification when one crosses an alert limit. */
export function startAlerts(): () => void {
  const watcher = new AlertWatcher();
  return band.subscribe(() => watcher.check(band.get()));
}
