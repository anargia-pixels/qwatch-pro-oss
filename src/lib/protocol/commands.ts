import { toBcd, writeUintLE } from "./bytes";
import { buildCommand, buildLargeFrame } from "./frames";

/** Command-channel keys, from `com.oudmon.ble.base.communication.Constants`. */
export const Key = {
  SetTime: 1,
  Battery: 3,
  PalmScreen: 5,
  DoNotDisturb: 6,
  TimeFormat: 10,
  HeartRateHistory: 21,
  HeartRateSettings: 22,
  RealTimeHeartRate: 30,
  Goals: 33,
  SetSedentary: 37,
  ReadSedentary: 38,
  Spo2Settings: 44,
  DeviceSupport: 60,
  TodaySteps: 72,
  FindDevice: 80,
  StartMeasure: 105,
  StopMeasure: 106,
  DeviceNotify: 115,
} as const;

/** Large-data actions, from `LargeDataHandler`. */
export const Action = {
  ManualHeartRate: 40,
  Spo2History: 42,
  IntervalHeartRate: 117,
} as const;

/** Measurement types for `StartMeasure` / `StopMeasure`. */
export const MeasureType = {
  HeartRate: 1,
  BloodPressure: 2,
  Spo2: 3,
} as const;
export type MeasureKind = "heartRate" | "spo2";

const MEASURE_TYPE = {
  heartRate: MeasureType.HeartRate,
  spo2: MeasureType.Spo2,
} as const satisfies Record<MeasureKind, number>;

/** Sub-commands of `RealTimeHeartRate`. */
export const LiveHeartRate = { Start: 1, Stop: 2, Continue: 3 } as const;

const READ = 1;
const WRITE = 2;
/** `SetTimeReq` language code for English. */
const LANGUAGE_ENGLISH = 1;

/** `SetTimeReq`: BCD date/time, language, then the UTC offset encoded in half hours. */
export function setTime(now: Date): Uint8Array {
  const offsetHours = -now.getTimezoneOffset() / 60;
  const zone = Math.round(((offsetHours + 24) % 24) * 2 + 1);
  return buildCommand(Key.SetTime, [
    toBcd(now.getFullYear() % 100),
    toBcd(now.getMonth() + 1),
    toBcd(now.getDate()),
    toBcd(now.getHours()),
    toBcd(now.getMinutes()),
    toBcd(now.getSeconds()),
    LANGUAGE_ENGLISH,
    zone,
  ]);
}

export function simple(key: number): Uint8Array {
  return buildCommand(key, []);
}

export function read(key: number): Uint8Array {
  return buildCommand(key, [READ]);
}

export function startMeasure(kind: MeasureKind): Uint8Array {
  const type = MEASURE_TYPE[kind];
  // `StartHeartRateReq.getSimpleReq`: types >= 3 carry BCD(25) as the sub byte.
  return buildCommand(Key.StartMeasure, [type, type < 3 ? 0 : toBcd(25)]);
}

export function stopMeasure(kind: MeasureKind, lastValue: number): Uint8Array {
  return buildCommand(Key.StopMeasure, [MEASURE_TYPE[kind], lastValue, 0]);
}

export function liveHeartRate(subCommand: number): Uint8Array {
  return buildCommand(Key.RealTimeHeartRate, [subCommand]);
}

/** Day start (local midnight) as "local time read as UTC" seconds, like `HeartRateDetailRepository`. */
export function heartRateHistory(dayStart: Date): Uint8Array {
  const seconds =
    Math.floor(dayStart.getTime() / 1000) - dayStart.getTimezoneOffset() * 60;
  return buildCommand(Key.HeartRateHistory, writeUintLE(seconds, 4));
}

export function findDevice(): Uint8Array {
  return buildCommand(Key.FindDevice, [0x55, 0xaa]);
}

export type HeartRateSettings = {
  enabled: boolean;
  intervalMinutes: number;
  /** Opaque byte the band reports back; written unchanged. */
  startInterval: number;
  lowAlert: number;
  highAlert: number;
};

export function writeHeartRateSettings(
  settings: HeartRateSettings,
): Uint8Array {
  return buildCommand(Key.HeartRateSettings, [
    WRITE,
    settings.enabled ? 1 : 2,
    settings.intervalMinutes,
    settings.startInterval,
    settings.lowAlert,
    settings.highAlert,
  ]);
}

export function writeSpo2Settings(enabled: boolean): Uint8Array {
  return buildCommand(Key.Spo2Settings, [WRITE, enabled ? 1 : 0]);
}

export type DisplayFormat = { is24Hour: boolean; metric: boolean };

export function writeTimeFormat(format: DisplayFormat): Uint8Array {
  return buildCommand(Key.TimeFormat, [
    WRITE,
    format.is24Hour ? 0 : 1,
    format.metric ? 0 : 1,
  ]);
}

export type RaiseToWake = { enabled: boolean; leftWrist: boolean };

export function writeRaiseToWake(setting: RaiseToWake): Uint8Array {
  // Bit 2 ("needPalm") is always set by the vendor app.
  return buildCommand(Key.PalmScreen, [
    WRITE,
    setting.enabled ? 1 : 2,
    (setting.leftWrist ? 1 : 2) | 4,
  ]);
}

export type TimeWindow = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export type DoNotDisturb = TimeWindow & { enabled: boolean };

export function writeDoNotDisturb(setting: DoNotDisturb): Uint8Array {
  return buildCommand(Key.DoNotDisturb, [
    WRITE,
    setting.enabled ? 1 : 2,
    setting.startHour,
    setting.startMinute,
    setting.endHour,
    setting.endMinute,
  ]);
}

export type Sedentary = TimeWindow & {
  /** Bit per weekday; 0 disables the reminder, 0x7f enables every day. */
  weekMask: number;
  /** 30, 60 or 90 minutes. */
  cycleMinutes: number;
};

export function writeSedentary(setting: Sedentary): Uint8Array {
  return buildCommand(Key.SetSedentary, [
    toBcd(setting.startHour),
    toBcd(setting.startMinute),
    toBcd(setting.endHour),
    toBcd(setting.endMinute),
    setting.weekMask,
    setting.cycleMinutes,
  ]);
}

export type Goals = {
  steps: number;
  /** Small calories (kcal × 1000), as stored on the band. */
  calories: number;
  meters: number;
  activeMinutes: number;
  sleepMinutes: number;
};

export function writeGoals(goals: Goals): Uint8Array {
  return buildCommand(Key.Goals, [
    WRITE,
    ...writeUintLE(goals.steps, 3),
    ...writeUintLE(goals.calories, 3),
    ...writeUintLE(goals.meters, 3),
    ...writeUintLE(goals.activeMinutes, 2),
    ...writeUintLE(goals.sleepMinutes, 2),
  ]);
}

/** `dayOffset` 0 is today, 1 yesterday. */
export function spo2History(dayOffset: number): Uint8Array {
  return buildLargeFrame(Action.Spo2History, [dayOffset]);
}

export function intervalHeartRate(
  dayOffset: number,
  packetIndex: number,
): Uint8Array {
  return buildLargeFrame(Action.IntervalHeartRate, [dayOffset, packetIndex]);
}

export function manualHeartRate(dayOffset: number): Uint8Array {
  return buildLargeFrame(Action.ManualHeartRate, [dayOffset === 0 ? 0 : 0xff]);
}
