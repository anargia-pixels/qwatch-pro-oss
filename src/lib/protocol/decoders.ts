import { fromBcd, readUintBE, readUintLE } from "./bytes";
import {
  Key,
  MeasureType,
  type DisplayFormat,
  type DoNotDisturb,
  type Goals,
  type HeartRateSettings,
  type MeasureKind,
  type RaiseToWake,
  type Sedentary,
} from "./commands";
import type { CommandFrame, LargeFrame } from "./frames";

export type Battery = { percent: number; charging: boolean };

export type TodayActivity = {
  steps: number;
  runningSteps: number;
  /** Small calories; divide by 1000 for kcal. */
  calories: number;
  meters: number;
  activeMinutes: number;
};

export type Capabilities = {
  heartRate: boolean;
  spo2: boolean;
  /** Interval heart rate over the large-data channel (action 117) instead of command 21. */
  intervalHeartRate: boolean;
};

export type Measurement = {
  kind: MeasureKind;
  /** 0 ok, 1 band not worn, other values abort the measurement. */
  errorCode: number;
  value: number;
};

/** Reasons the band pushes `DeviceNotify`; the app re-reads the matching data. */
export const NotifyReason = {
  HeartRate: 1,
  Spo2: 3,
  Steps: 4,
  Goals: 16,
} as const;

export type CommandEvent =
  | { type: "timeSet"; capabilities: Pick<Capabilities, "heartRate" | "spo2"> }
  | { type: "support"; intervalHeartRate: boolean }
  | { type: "battery"; battery: Battery }
  | { type: "activity"; activity: TodayActivity }
  | { type: "measurement"; measurement: Measurement }
  | { type: "liveHeartRate"; bpm: number }
  | { type: "heartRateSettings"; settings: HeartRateSettings }
  | { type: "spo2Settings"; enabled: boolean }
  | { type: "displayFormat"; format: DisplayFormat }
  | { type: "raiseToWake"; setting: RaiseToWake }
  | { type: "doNotDisturb"; setting: DoNotDisturb }
  | { type: "sedentary"; setting: Sedentary }
  | { type: "goals"; goals: Goals }
  | { type: "deviceNotify"; reason: number };

const READ_ACTION = 1;

function byteAt(payload: Uint8Array, index: number): number {
  return payload[index] ?? 0;
}

/** Decodes single-frame responses. Multi-frame heart rate history is handled by {@link HeartRateHistoryReader}. */
export function decodeCommand(frame: CommandFrame): CommandEvent | null {
  const p = frame.payload;
  const isReadReply = byteAt(p, 0) === READ_ACTION;
  switch (frame.key) {
    case Key.SetTime:
      return {
        type: "timeSet",
        capabilities: {
          // Inverted: set means the band has no heart rate (the vendor hides its heart card then).
          heartRate: (byteAt(p, 1) & 0x40) === 0,
          spo2: (byteAt(p, 3) & 0x02) !== 0,
        },
      };
    case Key.DeviceSupport:
      return {
        type: "support",
        intervalHeartRate: (byteAt(p, 7) & 0x08) !== 0,
      };
    case Key.Battery:
      return {
        type: "battery",
        battery: { percent: byteAt(p, 0), charging: byteAt(p, 1) === 1 },
      };
    case Key.TodaySteps:
      return {
        type: "activity",
        activity: {
          steps: readUintBE(p, 0, 3),
          runningSteps: readUintBE(p, 3, 3),
          calories: readUintBE(p, 6, 3),
          meters: readUintBE(p, 9, 3),
          activeMinutes: readUintBE(p, 12, 2),
        },
      };
    case Key.StartMeasure: {
      const type = byteAt(p, 0);
      if (type !== MeasureType.HeartRate && type !== MeasureType.Spo2)
        return null;
      return {
        type: "measurement",
        measurement: {
          kind: type === MeasureType.HeartRate ? "heartRate" : "spo2",
          errorCode: byteAt(p, 1),
          value: byteAt(p, 2),
        },
      };
    }
    case Key.RealTimeHeartRate:
      return { type: "liveHeartRate", bpm: byteAt(p, 0) };
    case Key.HeartRateSettings:
      if (!isReadReply) return null;
      return {
        type: "heartRateSettings",
        settings: {
          enabled: byteAt(p, 1) === 1,
          intervalMinutes: byteAt(p, 2),
          startInterval: byteAt(p, 3) || 5,
          lowAlert: byteAt(p, 4),
          highAlert: byteAt(p, 5),
        },
      };
    case Key.Spo2Settings:
      if (!isReadReply) return null;
      return { type: "spo2Settings", enabled: byteAt(p, 1) === 1 };
    case Key.TimeFormat:
      if (!isReadReply) return null;
      return {
        type: "displayFormat",
        format: { is24Hour: byteAt(p, 1) === 0, metric: byteAt(p, 2) === 0 },
      };
    case Key.PalmScreen:
      if (!isReadReply) return null;
      return {
        type: "raiseToWake",
        setting: {
          enabled: byteAt(p, 1) === 1,
          leftWrist: (byteAt(p, 2) & 1) === 1,
        },
      };
    case Key.DoNotDisturb:
      if (!isReadReply) return null;
      return {
        type: "doNotDisturb",
        setting: {
          enabled: byteAt(p, 1) === 1,
          startHour: byteAt(p, 2),
          startMinute: byteAt(p, 3),
          endHour: byteAt(p, 4),
          endMinute: byteAt(p, 5),
        },
      };
    case Key.ReadSedentary:
      return {
        type: "sedentary",
        setting: {
          startHour: fromBcd(byteAt(p, 0)),
          startMinute: fromBcd(byteAt(p, 1)),
          endHour: fromBcd(byteAt(p, 2)),
          endMinute: fromBcd(byteAt(p, 3)),
          weekMask: byteAt(p, 4),
          cycleMinutes: byteAt(p, 5),
        },
      };
    case Key.Goals:
      if (!isReadReply) return null;
      return {
        type: "goals",
        goals: {
          steps: readUintLE(p, 1, 3),
          calories: readUintLE(p, 4, 3),
          meters: readUintLE(p, 7, 3),
          activeMinutes: readUintLE(p, 10, 2),
          sleepMinutes: readUintLE(p, 12, 2),
        },
      };
    case Key.DeviceNotify:
      return { type: "deviceNotify", reason: byteAt(p, 0) };
    default:
      return null;
  }
}

/** One sample in a day series; `minute` counts from local midnight. */
export type HeartRateSample = { minute: number; bpm: number };

const NO_DATA_FRAME = 0xff;

/**
 * Collects the multi-frame command 21 reply (`ReadHeartRateRsp`): frame 0
 * carries the frame count and interval, frame 1 a timestamp plus 9 samples,
 * and later frames 13 samples each.
 */
export class HeartRateHistoryReader {
  private frameCount = 0;
  private intervalMinutes = 5;
  private values: number[] = [];

  /** Returns the finished series, or null while more frames are expected. */
  push(payload: Uint8Array): HeartRateSample[] | null {
    const index = byteAt(payload, 0);
    if (index === NO_DATA_FRAME) return this.finish();
    if (index === 0) {
      this.frameCount = byteAt(payload, 1);
      this.intervalMinutes = byteAt(payload, 2) || 5;
      this.values = [];
      return this.frameCount <= 1 ? this.finish() : null;
    }
    this.values.push(...payload.slice(index === 1 ? 5 : 1));
    return index >= this.frameCount - 1 ? this.finish() : null;
  }

  private finish(): HeartRateSample[] {
    const samples = toSamples(this.values, this.intervalMinutes);
    this.values = [];
    this.frameCount = 0;
    return samples;
  }
}

function toSamples(
  values: readonly number[],
  intervalMinutes: number,
): HeartRateSample[] {
  const dayMinutes = 24 * 60;
  return values
    .map((bpm, index) => ({ minute: index * intervalMinutes, bpm }))
    .filter((sample) => sample.bpm > 0 && sample.minute < dayMinutes);
}

export type IntervalHeartRatePage = {
  intervalMinutes: number;
  packetCount: number;
  packetIndex: number;
  values: number[];
};

/** Action 117 page: `[6]` day, `[7]` interval, `[8]` packet count, `[9]` index, then one byte per sample. */
export function decodeIntervalHeartRate(
  frame: LargeFrame,
): IntervalHeartRatePage {
  const bytes = frame.bytes;
  return {
    intervalMinutes: byteAt(bytes, 7) || 5,
    packetCount: byteAt(bytes, 8),
    packetIndex: byteAt(bytes, 9),
    values: Array.from(bytes.slice(10)),
  };
}

export function intervalPagesToSamples(
  pages: readonly IntervalHeartRatePage[],
): HeartRateSample[] {
  const interval = pages[0]?.intervalMinutes ?? 5;
  return toSamples(
    pages.flatMap((page) => page.values),
    interval,
  );
}

/** Hourly SpO2 range; `hour` 0..23. */
export type Spo2Hour = { hour: number; min: number; max: number };

const SPO2_RECORD_LENGTH = 49;

/** Action 42: 49-byte records of `[dayOffset, max0, min0, max1, min1, ...]`. Returns the record for `dayOffset`. */
export function decodeSpo2History(
  frame: LargeFrame,
  dayOffset: number,
): Spo2Hour[] {
  const bytes = frame.bytes;
  const recordCount = Math.floor(readUintLE(bytes, 2, 2) / SPO2_RECORD_LENGTH);
  for (let record = 0; record < recordCount; record++) {
    const start = 6 + record * SPO2_RECORD_LENGTH;
    if (byteAt(bytes, start) !== dayOffset) continue;
    const hours: Spo2Hour[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const max = byteAt(bytes, start + 1 + hour * 2);
      const min = byteAt(bytes, start + 2 + hour * 2);
      if (max > 0 || min > 0)
        hours.push({ hour, min: min || max, max: max || min });
    }
    return hours;
  }
  return [];
}

/** Action 40: `[6]` index, then 3-byte records of minute (LE16) and bpm. */
export function decodeManualHeartRate(frame: LargeFrame): HeartRateSample[] {
  const body = frame.bytes.slice(7);
  const samples: HeartRateSample[] = [];
  for (let i = 0; i + 2 < body.length; i += 3) {
    const bpm = byteAt(body, i + 2);
    if (bpm > 0) samples.push({ minute: readUintLE(body, i, 2), bpm });
  }
  return samples;
}
