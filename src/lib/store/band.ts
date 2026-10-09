import type {
  DisplayFormat,
  DoNotDisturb,
  Goals,
  HeartRateSettings,
  MeasureKind,
  RaiseToWake,
  Sedentary,
} from "@/lib/protocol/commands";
import type {
  Battery,
  Capabilities,
  HeartRateSample,
  Spo2Hour,
  TodayActivity,
} from "@/lib/protocol/decoders";

import { createStore } from "./createStore";

export type ConnectionStatus =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "reconnecting";

export type ScanResult = {
  id: string;
  name: string;
  /** dBm; null for devices already connected to the phone (they do not advertise). */
  rssi: number | null;
  /** Matches the vendor band filter, by name prefix or advertised service. */
  likelyBand: boolean;
};

export type ReadingSource = "manual" | "live" | "history";

export type Reading = {
  value: number;
  /** Epoch milliseconds. */
  measuredAt: number;
  source: ReadingSource;
};

export type DeviceInfo = {
  id: string;
  name: string;
  firmware: string;
  hardware: string;
};

export type BandSettings = {
  heartRate: HeartRateSettings | null;
  spo2Enabled: boolean | null;
  displayFormat: DisplayFormat | null;
  raiseToWake: RaiseToWake | null;
  doNotDisturb: DoNotDisturb | null;
  sedentary: Sedentary | null;
  goals: Goals | null;
};

/** Battery level seen at a point in time; used to estimate drain. */
export type BatterySample = { at: number; percent: number; charging: boolean };

export type BandState = {
  status: ConnectionStatus;
  scanResults: ScanResult[];
  device: DeviceInfo | null;
  battery: Battery | null;
  batteryHistory: BatterySample[];
  capabilities: Capabilities;
  activity: TodayActivity | null;
  activityUpdatedAt: number | null;
  heartRate: Reading | null;
  spo2: Reading | null;
  measuring: MeasureKind | null;
  liveHeartRate: boolean;
  heartRateHistory: HeartRateSample[];
  spo2History: Spo2Hour[];
  settings: BandSettings;
  error: string | null;
};

export const emptySettings: BandSettings = {
  heartRate: null,
  spo2Enabled: null,
  displayFormat: null,
  raiseToWake: null,
  doNotDisturb: null,
  sedentary: null,
  goals: null,
};

export const band = createStore<BandState>({
  status: "idle",
  scanResults: [],
  device: null,
  battery: null,
  batteryHistory: [],
  capabilities: { heartRate: true, spo2: true, intervalHeartRate: false },
  activity: null,
  activityUpdatedAt: null,
  heartRate: null,
  spo2: null,
  measuring: null,
  liveHeartRate: false,
  heartRateHistory: [],
  spo2History: [],
  settings: emptySettings,
  error: null,
});

export function patchSettings(patch: Partial<BandSettings>): void {
  band.set({ settings: { ...band.get().settings, ...patch } });
}

const BATTERY_HISTORY_MS = 24 * 3_600_000;

export function recordBattery(battery: Battery): void {
  const now = Date.now();
  const kept = band
    .get()
    .batteryHistory.filter((sample) => now - sample.at < BATTERY_HISTORY_MS);
  band.set({
    battery,
    batteryHistory: [...kept, { at: now, ...battery }],
  });
}

/**
 * Percent per hour lost since the band last stopped charging, or null with
 * under 30 minutes of discharge data.
 */
export function batteryDrainPerHour(
  samples: readonly BatterySample[],
): number | null {
  const lastCharging = samples.findLastIndex((sample) => sample.charging);
  const discharge = samples.slice(lastCharging + 1);
  const first = discharge[0];
  const last = discharge.at(-1);
  if (!first || !last) return null;
  const hours = (last.at - first.at) / 3_600_000;
  if (hours < 0.5) return null;
  return Math.max(0, (first.percent - last.percent) / hours);
}
