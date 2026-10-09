import type { HourBar } from "@/components/HourlyChart";
import type { HeartRateSample, Spo2Hour } from "@/lib/protocol/decoders";

export function timeAgo(at: number | null): string {
  if (at === null) return "never";
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Epoch ms of a history sample stamped as minutes since today's midnight. */
export function todayAtMinute(minute: number): number {
  return startOfToday().getTime() + minute * 60_000;
}

export const pad2 = (value: number): string => String(value).padStart(2, "0");

export const clock = (hour: number, minute: number): string =>
  `${pad2(hour)}:${pad2(minute)}`;

export function formatDistance(meters: number, metric: boolean): string {
  if (metric) return `${(meters / 1000).toFixed(2)} km`;
  return `${(meters / 1609.344).toFixed(2)} mi`;
}

/** Hourly min/max of the day's heart rate samples. */
export function heartRateBars(samples: readonly HeartRateSample[]): HourBar[] {
  const hours = new Map<number, HourBar>();
  for (const { minute, bpm } of samples) {
    const hour = Math.floor(minute / 60);
    const bar = hours.get(hour);
    hours.set(hour, {
      hour,
      low: Math.min(bar?.low ?? bpm, bpm),
      high: Math.max(bar?.high ?? bpm, bpm),
    });
  }
  return [...hours.values()];
}

export const spo2Bars = (hours: readonly Spo2Hour[]): HourBar[] =>
  hours.map(({ hour, min, max }) => ({ hour, low: min, high: max }));
