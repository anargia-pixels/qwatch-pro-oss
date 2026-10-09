import { AppState, type AppStateStatus } from "react-native";

import { qwatch } from "@/lib/ble/client";
import { appSettings, uploadsActive } from "@/lib/store/appSettings";
import { band } from "@/lib/store/band";
import { maybeUpload } from "@/lib/upload/uploader";
import { QWatchBackground } from "@/modules/qwatch-background";

/** How often band data is re-read in the background when nothing was pushed. */
const REFRESH_MINUTES_MIN = 5;
const REFRESH_MINUTES_MAX = 30;
/** Tick used when uploads are off: only reconnects and data refreshes need it. */
const IDLE_TICK_SECONDS = 15 * 60;

let inBackground = false;
let lastRefreshAt = 0;
let serviceShown: ServiceNotice | null = null;
let tickerSeconds: number | null = null;

/** Follows the band's own heart-rate interval, so we read right after it measures. */
function refreshIntervalMs(): number {
  const minutes = band.get().settings.heartRate?.intervalMinutes ?? 15;
  const clamped = Math.min(
    REFRESH_MINUTES_MAX,
    Math.max(REFRESH_MINUTES_MIN, minutes),
  );
  return clamped * 60_000;
}

function tickSeconds(): number {
  const settings = appSettings.get();
  const idle = Math.min(IDLE_TICK_SECONDS, refreshIntervalMs() / 1000);
  return uploadsActive(settings)
    ? Math.min(settings.intervalSeconds, idle)
    : idle;
}

async function onTick(): Promise<void> {
  const due = Date.now() - lastRefreshAt >= refreshIntervalMs();
  if (due) lastRefreshAt = Date.now();
  await qwatch.backgroundTick(due);
  await maybeUpload(true);
}

/** Runs the native tick only in the background, restarting it only when its period changes. */
function syncTicker(): void {
  const next = inBackground ? tickSeconds() : null;
  if (next === tickerSeconds) return;
  tickerSeconds = next;
  if (next === null) QWatchBackground?.stopTicker();
  else QWatchBackground?.startTicker(next);
}

function onAppState(next: AppStateStatus): void {
  const background = next !== "active";
  if (background === inBackground) return;
  inBackground = background;
  if (background) lastRefreshAt = Date.now();
  void qwatch.setForeground(!background);
  syncTicker();
}

type ServiceNotice = { title: string; text: string };

/** Latest readings for the notification body, e.g. "♥ 72 bpm · O₂ 98% · 6,400 steps". */
function readingsLine(): string {
  const { heartRate, spo2, activity } = band.get();
  return [
    `♥ ${heartRate ? heartRate.value : "--"} bpm`,
    `O₂ ${spo2 ? `${spo2.value}%` : "--"}`,
    `${activity ? activity.steps.toLocaleString() : "--"} steps`,
  ].join(" · ");
}

/** Android foreground service notification, or null when the service should not run. */
function serviceNotice(): ServiceNotice | null {
  const { backgroundEnabled, lastDeviceId } = appSettings.get();
  const { status, device, battery } = band.get();
  if (!backgroundEnabled || !lastDeviceId) return null;
  if (status === "idle" || status === "scanning") return null;
  if (status !== "connected") {
    return { title: "Reconnecting to your band…", text: readingsLine() };
  }
  const level = battery ? ` · ${battery.percent}% battery` : "";
  return {
    title: `${device?.name ?? "Your band"}${level}`,
    text: readingsLine(),
  };
}

/**
 * Starts the service while the app is visible (Android 12+ refuses to start
 * one from the background), updates its text in place, and stops it when the
 * band is disconnected on purpose or background mode is turned off.
 */
function syncService(): void {
  if (!QWatchBackground) return;
  const next = serviceNotice();
  if (
    next?.title === serviceShown?.title &&
    next?.text === serviceShown?.text
  ) {
    return;
  }
  const wasRunning = serviceShown !== null;
  serviceShown = next;
  if (next === null) {
    QWatchBackground.stopService();
  } else if (wasRunning) {
    QWatchBackground.updateService(next.title, next.text);
  } else if (!QWatchBackground.startService(next.title, next.text)) {
    serviceShown = null;
  }
}

/**
 * Wires background behaviour. Nothing here polls: the native tick is a single
 * coarse timer, and band pushes arrive as BLE notifications. On iOS (no native
 * module) those notifications wake the app and trigger the upload check.
 */
export function startBackground(): () => void {
  const subscriptions = [
    AppState.addEventListener("change", onAppState),
    QWatchBackground?.addListener("onTick", () => void onTick()),
  ];
  const unsubscribers = [
    band.subscribe(() => {
      syncService();
      syncTicker();
      if (inBackground) void maybeUpload(true);
    }),
    appSettings.subscribe(() => {
      syncService();
      syncTicker();
    }),
  ];
  onAppState(AppState.currentState);
  syncService();
  return () => {
    for (const subscription of subscriptions) subscription?.remove();
    for (const unsubscribe of unsubscribers) unsubscribe();
    QWatchBackground?.stopTicker();
    tickerSeconds = null;
  };
}
