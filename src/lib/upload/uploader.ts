import { startOfToday } from "@/lib/format";
import type { HeartRateSample, Spo2Hour } from "@/lib/protocol/decoders";
import { appSettings, uploadsActive } from "@/lib/store/appSettings";
import {
  band,
  batteryDrainPerHour,
  currentHeartRate,
  currentSpo2,
  type Reading,
} from "@/lib/store/band";

const REQUEST_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 15 * 60_000;
/** A request older than this is treated as hung (JS timers, and so the abort, pause in the background). */
const STALE_REQUEST_MS = 60_000;

let lastSent = { at: 0, fingerprint: "" };
/**
 * History entries the server already has, for the day starting at `dayStart`.
 * Keyed by minute (heart rate) or hour (SpO2), valued by the entry as sent, so
 * an entry the band later revises goes out again.
 */
let delivered = {
  dayStart: 0,
  heartRate: new Map<number, string>(),
  spo2: new Map<number, string>(),
};
let lastAttemptAt = 0;
let inFlightSince: number | null = null;

function reading(value: Reading | null) {
  if (!value) return null;
  return {
    value: value.value,
    measuredAt: new Date(value.measuredAt).toISOString(),
    source: value.source,
  };
}

/** Only the history entries that are new or changed since the last delivered upload. */
function historyDelta(dayStart: number) {
  const state = band.get();
  const sameDay = delivered.dayStart === dayStart;
  const isNew = (
    sent: Map<number, string>,
    key: number,
    entry: HeartRateSample | Spo2Hour,
  ) => !sameDay || sent.get(key) !== JSON.stringify(entry);
  return {
    dayStart: new Date(dayStart).toISOString(),
    heartRate: state.heartRateHistory.filter((sample) =>
      isNew(delivered.heartRate, sample.minute, sample),
    ),
    spo2: state.spo2History.filter((hour) =>
      isNew(delivered.spo2, hour.hour, hour),
    ),
  };
}

function markDelivered(history: ReturnType<typeof historyDelta>): void {
  const dayStart = new Date(history.dayStart).getTime();
  if (delivered.dayStart !== dayStart) {
    delivered = { dayStart, heartRate: new Map(), spo2: new Map() };
  }
  for (const sample of history.heartRate) {
    delivered.heartRate.set(sample.minute, JSON.stringify(sample));
  }
  for (const hour of history.spo2) {
    delivered.spo2.set(hour.hour, JSON.stringify(hour));
  }
}

/** JSON body POSTed to the configured server; documented in docs/APP.md. */
export function buildPayload() {
  const state = band.get();
  const activity = state.activity;
  const now = Date.now();
  return {
    source: "qwatch-pro-oss",
    version: 2,
    sentAt: new Date().toISOString(),
    connected: state.status === "connected",
    device: state.device && {
      id: state.device.id,
      name: state.device.name,
      firmware: state.device.firmware,
      hardware: state.device.hardware,
    },
    battery: state.battery && {
      percent: state.battery.percent,
      charging: state.battery.charging,
      drainPerHour: batteryDrainPerHour(state.batteryHistory),
    },
    // A reading that is no longer current goes out as null, never as an old value.
    heartRate: reading(currentHeartRate(state, now)),
    spo2: reading(currentSpo2(state, now)),
    steps: activity && {
      total: activity.steps,
      running: activity.runningSteps,
      kcal: Math.round(activity.calories / 1000),
      distanceMeters: activity.meters,
      activeMinutes: activity.activeMinutes,
      goal: state.settings.goals?.steps ?? null,
      updatedAt:
        state.activityUpdatedAt === null
          ? null
          : new Date(state.activityUpdatedAt).toISOString(),
    },
    history: historyDelta(startOfToday().getTime()),
  };
}

/** The current readings, ignoring the timestamp and history, to tell whether anything changed. */
function fingerprint(payload: ReturnType<typeof buildPayload>): string {
  return JSON.stringify({ ...payload, sentAt: null, history: null });
}

function hasHistory(payload: ReturnType<typeof buildPayload>): boolean {
  return (
    payload.history.heartRate.length > 0 || payload.history.spo2.length > 0
  );
}

function recordUpload(ok: boolean, message: string): boolean {
  appSettings.set({ lastUpload: { at: Date.now(), ok, message } });
  return ok;
}

/** Sends one upload and records the outcome in `appSettings.lastUpload`. */
export async function uploadNow(): Promise<boolean> {
  const { serverUrl, authToken } = appSettings.get();
  const url = serverUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return recordUpload(false, "Set an http(s) URL first.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = authToken.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const payload = buildPayload();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.ok) {
      lastSent = { at: Date.now(), fingerprint: fingerprint(payload) };
      markDelivered(payload.history);
    }
    return recordUpload(response.ok, `HTTP ${response.status}`);
  } catch (error) {
    return recordUpload(
      false,
      error instanceof Error ? error.message : "Request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Uploads when uploads are on and the interval has passed. With
 * `skipUnchanged`, used in the background, an identical payload is skipped
 * unless the 15-minute heartbeat is due, so an idle band costs no network.
 */
export async function maybeUpload(skipUnchanged: boolean): Promise<void> {
  const settings = appSettings.get();
  if (!uploadsActive(settings)) return;
  const now = Date.now();
  if (inFlightSince !== null && now - inFlightSince < STALE_REQUEST_MS) return;
  // A little slack so a tick that fires slightly early still counts.
  if (now - lastAttemptAt < settings.intervalSeconds * 1000 - 1000) return;
  if (skipUnchanged && now - lastSent.at < HEARTBEAT_MS) {
    const payload = buildPayload();
    if (!hasHistory(payload) && fingerprint(payload) === lastSent.fingerprint) {
      return;
    }
  }
  lastAttemptAt = now;
  inFlightSince = now;
  try {
    await uploadNow();
  } finally {
    inFlightSince = null;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let activeKey = "";

/** Foreground schedule: one JS interval matching the current settings. */
export function syncUploader(): void {
  const settings = appSettings.get();
  const { serverUrl, intervalSeconds } = settings;
  const key = uploadsActive(settings) ? `${serverUrl}|${intervalSeconds}` : "";
  if (key === activeKey) return;
  activeKey = key;
  if (timer) clearInterval(timer);
  timer = null;
  if (!key) return;
  timer = setInterval(() => void maybeUpload(false), intervalSeconds * 1000);
}

export function startUploader(): () => void {
  syncUploader();
  return appSettings.subscribe(syncUploader);
}
