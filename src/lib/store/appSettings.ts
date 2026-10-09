import AsyncStorage from "@react-native-async-storage/async-storage";

import { createStore } from "./createStore";

export const MIN_UPLOAD_INTERVAL_SECONDS = 15;
const DEFAULT_INTERVAL_SECONDS = 60;

/** Alert thresholds: the default and the range offered in Settings. */
export const HEART_RATE_LOW_LIMITS = {
  initial: 50,
  min: 30,
  max: 100,
} as const;
/**
 * Starts where the low range ends, so the two limits can never cross.
 * `initial` is what the stepper shows when the user turns this alert on; it
 * is off by default so exercise does not notify anyone who never asked.
 */
export const HEART_RATE_HIGH_LIMITS = {
  initial: 120,
  min: 100,
  max: 220,
} as const;
export const SPO2_LOW_LIMITS = { initial: 92, min: 80, max: 99 } as const;

type Limits = { initial: number; min: number; max: number };

export type UploadResult = {
  at: number;
  ok: boolean;
  message: string;
};

export type AppSettings = {
  loaded: boolean;
  uploadEnabled: boolean;
  serverUrl: string;
  intervalSeconds: number;
  authToken: string;
  lastDeviceId: string | null;
  /** Keep the band connected (and uploads running) while the app is closed. */
  backgroundEnabled: boolean;
  alertsEnabled: boolean;
  /** Notify when heart rate drops below this many bpm. */
  heartRateLow: number;
  /** Notify when heart rate rises above this many bpm; `null` is off. */
  heartRateHigh: number | null;
  /** Notify when blood oxygen drops below this percentage. */
  spo2Low: number;
  lastUpload: UploadResult | null;
};

type PersistedKey = Exclude<keyof AppSettings, "loaded" | "lastUpload">;

/** Each setting is its own string key so loading never parses untrusted JSON. */
const STORAGE_KEYS = {
  uploadEnabled: "qwatch.uploadEnabled",
  serverUrl: "qwatch.serverUrl",
  intervalSeconds: "qwatch.intervalSeconds",
  authToken: "qwatch.authToken",
  lastDeviceId: "qwatch.lastDeviceId",
  backgroundEnabled: "qwatch.backgroundEnabled",
  alertsEnabled: "qwatch.alertsEnabled",
  heartRateLow: "qwatch.heartRateLow",
  heartRateHigh: "qwatch.heartRateHigh",
  spo2Low: "qwatch.spo2Low",
} as const satisfies Record<PersistedKey, string>;

// SAFETY: `satisfies` above pins STORAGE_KEYS to exactly the persisted keys.
const PERSISTED_KEYS = Object.keys(STORAGE_KEYS) as PersistedKey[];

export const appSettings = createStore<AppSettings>({
  loaded: false,
  uploadEnabled: false,
  serverUrl: "",
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  authToken: "",
  lastDeviceId: null,
  backgroundEnabled: true,
  alertsEnabled: false,
  heartRateLow: HEART_RATE_LOW_LIMITS.initial,
  heartRateHigh: null,
  spo2Low: SPO2_LOW_LIMITS.initial,
  lastUpload: null,
});

/** Uploads are switched on and have somewhere to go. */
export function uploadsActive(settings: AppSettings): boolean {
  return settings.loaded && settings.uploadEnabled && settings.serverUrl !== "";
}

export function toIntervalSeconds(text: string | null): number {
  const value = Math.round(Number(text ?? ""));
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_SECONDS;
  return Math.max(MIN_UPLOAD_INTERVAL_SECONDS, value);
}

/** Whole number in `[min, max]`, or the initial value when the stored text is missing or junk. */
function toBoundedInt(text: string | null, limits: Limits): number {
  const value = Math.round(Number(text ?? ""));
  if (text === null || !Number.isFinite(value)) return limits.initial;
  return Math.min(limits.max, Math.max(limits.min, value));
}

async function readStored(): Promise<Record<PersistedKey, string | null>> {
  const entries = await Promise.all(
    PERSISTED_KEYS.map(
      async (key) =>
        [key, await AsyncStorage.getItem(STORAGE_KEYS[key])] as const,
    ),
  );
  // SAFETY: `entries` has one pair for every key in PERSISTED_KEYS.
  return Object.fromEntries(entries) as Record<PersistedKey, string | null>;
}

export async function loadAppSettings(): Promise<void> {
  const stored = await readStored();
  appSettings.set({
    loaded: true,
    uploadEnabled: stored.uploadEnabled === "true",
    serverUrl: stored.serverUrl ?? "",
    intervalSeconds:
      stored.intervalSeconds === null
        ? DEFAULT_INTERVAL_SECONDS
        : toIntervalSeconds(stored.intervalSeconds),
    authToken: stored.authToken ?? "",
    lastDeviceId: stored.lastDeviceId,
    backgroundEnabled: stored.backgroundEnabled !== "false",
    alertsEnabled: stored.alertsEnabled === "true",
    heartRateLow: toBoundedInt(stored.heartRateLow, HEART_RATE_LOW_LIMITS),
    heartRateHigh:
      stored.heartRateHigh === null
        ? null
        : toBoundedInt(stored.heartRateHigh, HEART_RATE_HIGH_LIMITS),
    spo2Low: toBoundedInt(stored.spo2Low, SPO2_LOW_LIMITS),
  });
}

export async function saveAppSettings(
  patch: Partial<Pick<AppSettings, PersistedKey>>,
): Promise<void> {
  appSettings.set(patch);
  const writes = PERSISTED_KEYS.map((key) => {
    const value = patch[key];
    if (value === undefined) return Promise.resolve();
    return value === null
      ? AsyncStorage.removeItem(STORAGE_KEYS[key])
      : AsyncStorage.setItem(STORAGE_KEYS[key], String(value));
  });
  await Promise.all(writes);
}
