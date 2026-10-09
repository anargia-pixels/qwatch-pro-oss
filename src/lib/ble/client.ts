import { Platform } from "react-native";
import {
  BleManager,
  ConnectionPriority,
  ScanMode,
  State,
  type Characteristic,
  type Device,
  type Subscription,
} from "react-native-ble-plx";

import { startOfToday, todayAtMinute } from "@/lib/format";
import { base64ToBytes, bytesToBase64 } from "@/lib/protocol/bytes";
import * as cmd from "@/lib/protocol/commands";
import {
  Action,
  Key,
  LiveHeartRate,
  type DisplayFormat,
  type DoNotDisturb,
  type Goals,
  type HeartRateSettings,
  type MeasureKind,
  type RaiseToWake,
  type Sedentary,
} from "@/lib/protocol/commands";
import {
  HeartRateHistoryReader,
  NotifyReason,
  decodeCommand,
  decodeIntervalHeartRate,
  decodeSpo2History,
  intervalPagesToSamples,
  type CommandEvent,
  type IntervalHeartRatePage,
} from "@/lib/protocol/decoders";
import {
  LargeFrameAssembler,
  parseCommandFrame,
  type LargeFrame,
} from "@/lib/protocol/frames";
import { appSettings, saveAppSettings } from "@/lib/store/appSettings";
import {
  band,
  emptySettings,
  patchSettings,
  recordBattery,
  type Reading,
  type ScanResult,
} from "@/lib/store/band";

import { requestBluetoothPermissions } from "./permissions";
import { isLikelyBand } from "./scanFilter";
import {
  COMMAND_NOTIFY,
  COMMAND_SERVICE,
  COMMAND_WRITE,
  DEVICE_INFO_SERVICE,
  FIRMWARE_REVISION,
  HARDWARE_REVISION,
  LARGE_NOTIFY,
  LARGE_SERVICE,
  LARGE_WRITE,
} from "./uuids";

/** `BleScannerHelper` scans for 12 s. */
const SCAN_DURATION_MS = 12_000;
/** `DeviceBindActivity` stops once more than 20 bands are listed. */
const SCAN_MAX_BANDS = 20;
const CONNECT_TIMEOUT_MS = 15_000;
const MTU = 247;
/** The vendor UI counts down 25 s; allow a little slack before giving up. */
const MEASURE_TIMEOUT_MS = 40_000;
/** `RealTimeHeartRate` stops on the band unless "continue" arrives regularly. */
const LIVE_KEEPALIVE_MS = 20_000;
const STEPS_POLL_MS = 60_000;
const BATTERY_POLL_MS = 5 * 60_000;
const HISTORY_POLL_MS = 10 * 60_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

type PendingMeasurement = {
  kind: MeasureKind;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: number | null) => void;
};

function decodeText(value: string | null): string {
  if (value === null) return "";
  return String.fromCharCode(...base64ToBytes(value))
    .replace(/\0/g, "")
    .trim();
}

function deviceName(device: Device): string | null {
  return device.name ?? device.localName;
}

class QWatchClient {
  private manager: BleManager | null = null;
  private deviceId: string | null = null;
  private subscriptions: Subscription[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private assembler = new LargeFrameAssembler();
  private historyReader = new HeartRateHistoryReader();
  private intervalPages: IntervalHeartRatePage[] = [];
  private measurement: PendingMeasurement | null = null;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private userDisconnected = false;
  /** Device id of a connect attempt that has not finished yet. */
  private pendingId: string | null = null;
  private foreground = true;

  /**
   * Created lazily so importing the module never touches the native side. The
   * restore identifier lets iOS relaunch the app for BLE events in the background.
   */
  private ble(): BleManager {
    this.manager ??= new BleManager({
      restoreStateIdentifier: "qwatch-band",
      restoreStateFunction: () => undefined,
    });
    return this.manager;
  }

  private async ensureReady(): Promise<boolean> {
    if (!(await requestBluetoothPermissions())) {
      band.set({ error: "Bluetooth permission was denied." });
      return false;
    }
    const state = await this.ble().state();
    if (state !== State.PoweredOn) {
      band.set({ error: "Turn Bluetooth on to reach your band." });
      return false;
    }
    return true;
  }

  /**
   * Lists nearby devices like the vendor bind screen: every named advertiser is
   * kept and flagged with `likelyBand`, so the UI can hide the rest. Bands that
   * are already connected to the phone do not advertise, so those are added
   * from the OS connection list first.
   */
  async scan(): Promise<void> {
    if (!(await this.ensureReady())) return;
    this.stopScan();
    band.set({ status: "scanning", scanResults: [], error: null });
    const manager = this.ble();
    const connected = await manager
      .connectedDevices([COMMAND_SERVICE])
      .catch((): Device[] => []);
    for (const device of connected) this.addScanResult(device, true);
    await manager.startDeviceScan(
      null,
      { scanMode: ScanMode.LowLatency },
      (error, device) => {
        if (error) {
          band.set({ status: "idle", error: error.message });
          return;
        }
        if (device) this.addScanResult(device, false);
      },
    );
    this.scanTimer = setTimeout(() => this.stopScan(), SCAN_DURATION_MS);
  }

  private addScanResult(device: Device, alreadyConnected: boolean): void {
    const name = deviceName(device);
    if (!name) return;
    const result: ScanResult = {
      id: device.id,
      name,
      rssi: alreadyConnected ? null : device.rssi,
      likelyBand: alreadyConnected || isLikelyBand(name, device.serviceUUIDs),
    };
    const results = [
      ...band.get().scanResults.filter((r) => r.id !== device.id),
      result,
    ].sort((a, b) => (b.rssi ?? 0) - (a.rssi ?? 0));
    band.set({ scanResults: results });
    if (results.filter((r) => r.likelyBand).length > SCAN_MAX_BANDS) {
      this.stopScan();
    }
  }

  stopScan(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    if (!this.manager) return;
    void this.manager.stopDeviceScan();
    if (band.get().status === "scanning") band.set({ status: "idle" });
  }

  /** Reconnects to the band saved from the last session, if any. */
  async restore(): Promise<void> {
    const id = appSettings.get().lastDeviceId;
    if (id && band.get().status === "idle") await this.connect(id);
  }

  /**
   * Foreground attempts time out and back off. In the background JS timers are
   * paused, so the attempt instead uses `autoConnect` with no timeout: the OS
   * waits for the band at low duty and completes the connection when it shows up.
   */
  async connect(id: string): Promise<void> {
    if (!(await this.ensureReady())) return;
    this.stopScan();
    this.cancelReconnect();
    this.userDisconnected = false;
    this.pendingId = id;
    band.set({ status: "connecting", error: null });
    try {
      const manager = this.ble();
      const device = await manager.connectToDevice(
        id,
        this.foreground
          ? { requestMTU: MTU, timeout: CONNECT_TIMEOUT_MS }
          : { requestMTU: MTU, autoConnect: true },
      );
      this.pendingId = null;
      await device.discoverAllServicesAndCharacteristics();
      this.deviceId = id;
      this.subscriptions.push(
        manager.onDeviceDisconnected(id, () => this.handleDisconnect()),
      );
      await this.handshake(deviceName(device) ?? "QWatch");
      this.reconnectAttempts = 0;
      await saveAppSettings({ lastDeviceId: id });
    } catch (error) {
      this.pendingId = null;
      this.teardown();
      band.set({
        error: error instanceof Error ? error.message : "Connection failed.",
      });
      if (this.userDisconnected) return;
      this.scheduleReconnect(id);
    }
  }

  /** Mirrors `BleOperateManager` connect: notify, device info, time, support, battery, settings. */
  private async handshake(name: string): Promise<void> {
    const manager = this.ble();
    const id = this.deviceId;
    if (!id) return;
    this.subscriptions.push(
      manager.monitorCharacteristicForDevice(
        id,
        COMMAND_SERVICE,
        COMMAND_NOTIFY,
        (error, characteristic) => {
          if (!error) this.onCommandNotify(characteristic);
        },
      ),
    );
    const [hardware, firmware] = await Promise.all([
      this.readText(HARDWARE_REVISION),
      this.readText(FIRMWARE_REVISION),
    ]);
    this.subscriptions.push(
      manager.monitorCharacteristicForDevice(
        id,
        LARGE_SERVICE,
        LARGE_NOTIFY,
        (error, characteristic) => {
          if (!error) this.onLargeNotify(characteristic);
        },
      ),
    );
    band.set({
      status: "connected",
      device: { id, name, firmware, hardware },
      settings: emptySettings,
    });

    await this.syncTime();
    await this.send(cmd.simple(Key.DeviceSupport));
    await this.send(cmd.simple(Key.Battery));
    await this.readAllSettings();
    await this.send(cmd.simple(Key.TodaySteps));
    await this.refreshHistory();
    if (this.foreground) {
      this.startPolling();
    } else {
      await this.setPriority(ConnectionPriority.LowPower);
    }
  }

  /**
   * Called on app state changes. In the background the client stops polling and
   * live heart rate and asks for a low-power connection interval; it then only
   * reacts to band pushes and the native background tick.
   */
  async setForeground(active: boolean): Promise<void> {
    if (this.foreground === active) return;
    this.foreground = active;
    const status = band.get().status;
    if (active && status === "reconnecting" && !this.reconnectTimer) {
      const id = appSettings.get().lastDeviceId;
      if (id) void this.connect(id);
      return;
    }
    if (status !== "connected") return;
    if (active) {
      await this.setPriority(ConnectionPriority.Balanced);
      this.startPolling();
      await this.refresh();
      return;
    }
    this.clearTimers();
    if (this.liveTimer) await this.stopLive();
    await this.setPriority(ConnectionPriority.LowPower);
  }

  /** Background work, driven by the native tick: retry a dropped link or refresh data. */
  async backgroundTick(refresh: boolean): Promise<void> {
    const status = band.get().status;
    const id = appSettings.get().lastDeviceId;
    if (status === "reconnecting" && id) {
      await this.connect(id);
      return;
    }
    if (status === "connected" && refresh) await this.refresh();
  }

  private async setPriority(priority: ConnectionPriority): Promise<void> {
    const id = this.deviceId;
    if (Platform.OS !== "android" || !id) return;
    await this.ble()
      .requestConnectionPriorityForDevice(id, priority)
      .catch(() => undefined);
  }

  private async readText(characteristic: string): Promise<string> {
    const id = this.deviceId;
    if (!id) return "";
    try {
      const result = await this.ble().readCharacteristicForDevice(
        id,
        DEVICE_INFO_SERVICE,
        characteristic,
      );
      return decodeText(result.value);
    } catch {
      return "";
    }
  }

  private startPolling(): void {
    this.clearTimers();
    this.timers.push(
      setInterval(
        () => void this.send(cmd.simple(Key.TodaySteps)),
        STEPS_POLL_MS,
      ),
      setInterval(
        () => void this.send(cmd.simple(Key.Battery)),
        BATTERY_POLL_MS,
      ),
      setInterval(() => void this.refreshHistory(), HISTORY_POLL_MS),
    );
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  async readAllSettings(): Promise<void> {
    await this.send(cmd.read(Key.HeartRateSettings));
    await this.send(cmd.read(Key.Spo2Settings));
    await this.send(cmd.read(Key.PalmScreen));
    await this.send(cmd.read(Key.TimeFormat));
    await this.send(cmd.read(Key.DoNotDisturb));
    await this.send(cmd.read(Key.Goals));
    await this.send(cmd.simple(Key.ReadSedentary));
  }

  async refresh(): Promise<void> {
    await this.send(cmd.simple(Key.TodaySteps));
    await this.send(cmd.simple(Key.Battery));
    await this.refreshHistory();
  }

  private async refreshHistory(): Promise<void> {
    if (band.get().capabilities.intervalHeartRate) {
      this.intervalPages = [];
      await this.sendLarge(cmd.intervalHeartRate(0, 0));
    } else {
      await this.send(cmd.heartRateHistory(startOfToday()));
    }
    await this.sendLarge(cmd.spo2History(0));
  }

  /** Serialises writes; the band handles one request at a time. */
  private send(frame: Uint8Array): Promise<void> {
    return this.enqueue(COMMAND_SERVICE, COMMAND_WRITE, frame, true);
  }

  private sendLarge(frame: Uint8Array): Promise<void> {
    return this.enqueue(LARGE_SERVICE, LARGE_WRITE, frame, false);
  }

  private enqueue(
    service: string,
    characteristic: string,
    frame: Uint8Array,
    withResponse: boolean,
  ): Promise<void> {
    const task = this.writeChain.then(async () => {
      const id = this.deviceId;
      if (!id) return;
      const manager = this.ble();
      const value = bytesToBase64(frame);
      if (withResponse) {
        await manager.writeCharacteristicWithResponseForDevice(
          id,
          service,
          characteristic,
          value,
        );
      } else {
        await manager.writeCharacteristicWithoutResponseForDevice(
          id,
          service,
          characteristic,
          value,
        );
      }
    });
    this.writeChain = task.catch(() => undefined);
    return task.catch((error) => {
      band.set({
        error: error instanceof Error ? error.message : "Write failed.",
      });
    });
  }

  private onCommandNotify(characteristic: Characteristic | null): void {
    if (!characteristic?.value) return;
    const frame = parseCommandFrame(base64ToBytes(characteristic.value));
    if (!frame || frame.failed) return;
    if (frame.key === Key.HeartRateHistory) {
      const samples = this.historyReader.push(frame.payload);
      if (!samples) return;
      band.set({ heartRateHistory: samples });
      this.applyLatestFromHistory();
      return;
    }
    const event = decodeCommand(frame);
    if (event) this.apply(event);
  }

  private onLargeNotify(characteristic: Characteristic | null): void {
    if (!characteristic?.value) return;
    const frame = this.assembler.push(base64ToBytes(characteristic.value));
    if (frame) this.applyLarge(frame);
  }

  private applyLarge(frame: LargeFrame): void {
    if (frame.action === Action.IntervalHeartRate) {
      const page = decodeIntervalHeartRate(frame);
      if (page.packetCount === 0) {
        band.set({ heartRateHistory: [] });
        return;
      }
      this.intervalPages.push(page);
      if (page.packetIndex < page.packetCount - 1) {
        void this.sendLarge(cmd.intervalHeartRate(0, page.packetIndex + 1));
        return;
      }
      band.set({
        heartRateHistory: intervalPagesToSamples(this.intervalPages),
      });
      this.intervalPages = [];
      this.applyLatestFromHistory();
      return;
    }
    if (frame.action === Action.Spo2History) {
      const hours = decodeSpo2History(frame, 0);
      band.set({ spo2History: hours });
      const latest = hours.at(-1);
      const current = band.get().spo2;
      if (latest && (!current || current.source === "history")) {
        band.set({
          spo2: {
            value: latest.max,
            measuredAt: todayAtMinute(latest.hour * 60),
            source: "history",
          },
        });
      }
    }
  }

  /** Shows the newest automatic reading until the user measures manually. */
  private applyLatestFromHistory(): void {
    const latest = band.get().heartRateHistory.at(-1);
    const current = band.get().heartRate;
    if (!latest) return;
    const measuredAt = todayAtMinute(latest.minute);
    if (current && current.measuredAt >= measuredAt) return;
    band.set({
      heartRate: { value: latest.bpm, measuredAt, source: "history" },
    });
  }

  private apply(event: CommandEvent): void {
    switch (event.type) {
      case "timeSet":
        band.set({
          capabilities: { ...band.get().capabilities, ...event.capabilities },
        });
        return;
      case "support":
        band.set({
          capabilities: {
            ...band.get().capabilities,
            intervalHeartRate: event.intervalHeartRate,
          },
        });
        return;
      case "battery":
        recordBattery(event.battery);
        return;
      case "activity":
        band.set({ activity: event.activity, activityUpdatedAt: Date.now() });
        return;
      case "measurement":
        this.onMeasurement(
          event.measurement.kind,
          event.measurement.errorCode,
          event.measurement.value,
        );
        return;
      case "liveHeartRate":
        if (event.bpm > 0) {
          band.set({
            heartRate: {
              value: event.bpm,
              measuredAt: Date.now(),
              source: "live",
            },
          });
        }
        return;
      case "heartRateSettings":
        patchSettings({ heartRate: event.settings });
        return;
      case "spo2Settings":
        patchSettings({ spo2Enabled: event.enabled });
        return;
      case "displayFormat":
        patchSettings({ displayFormat: event.format });
        return;
      case "raiseToWake":
        patchSettings({ raiseToWake: event.setting });
        return;
      case "doNotDisturb":
        patchSettings({ doNotDisturb: event.setting });
        return;
      case "sedentary":
        patchSettings({ sedentary: event.setting });
        return;
      case "goals":
        patchSettings({ goals: event.goals });
        return;
      case "deviceNotify":
        this.onDeviceNotify(event.reason);
        return;
      default:
        return;
    }
  }

  private onDeviceNotify(reason: number): void {
    if (reason === NotifyReason.Steps)
      void this.send(cmd.simple(Key.TodaySteps));
    if (reason === NotifyReason.HeartRate || reason === NotifyReason.Spo2) {
      void this.refreshHistory();
    }
    if (reason === NotifyReason.Goals) void this.send(cmd.read(Key.Goals));
  }

  /** One-shot measurement like the vendor HR / SpO2 screens; resolves with the value or null. */
  async measure(kind: MeasureKind): Promise<number | null> {
    if (this.measurement || band.get().status !== "connected") return null;
    if (kind === "heartRate" && band.get().liveHeartRate) await this.stopLive();
    band.set({ measuring: kind, error: null });
    const result = new Promise<number | null>((resolve) => {
      const timer = setTimeout(
        () => this.finishMeasurement(null, "No reading — try again."),
        MEASURE_TIMEOUT_MS,
      );
      this.measurement = { kind, timer, resolve };
    });
    await this.send(cmd.startMeasure(kind));
    return result;
  }

  cancelMeasurement(): void {
    this.finishMeasurement(null, null);
  }

  private onMeasurement(
    kind: MeasureKind,
    errorCode: number,
    value: number,
  ): void {
    if (this.measurement?.kind !== kind) return;
    if (errorCode === 1) {
      this.finishMeasurement(null, "Wear the band snugly and try again.");
      return;
    }
    if (errorCode !== 0) {
      this.finishMeasurement(null, "The band stopped the measurement.");
      return;
    }
    if (value > 0) this.finishMeasurement(value, null);
  }

  private finishMeasurement(value: number | null, error: string | null): void {
    const pending = this.measurement;
    if (!pending) return;
    this.measurement = null;
    clearTimeout(pending.timer);
    void this.send(cmd.stopMeasure(pending.kind, value ?? 0));
    band.set({ measuring: null, error });
    if (value !== null) {
      const reading: Reading = {
        value,
        measuredAt: Date.now(),
        source: "manual",
      };
      band.set(
        pending.kind === "heartRate"
          ? { heartRate: reading }
          : { spo2: reading },
      );
    }
    pending.resolve(value);
  }

  async startLive(): Promise<void> {
    if (band.get().status !== "connected" || this.liveTimer) return;
    band.set({ liveHeartRate: true });
    await this.send(cmd.liveHeartRate(LiveHeartRate.Start));
    this.liveTimer = setInterval(
      () => void this.send(cmd.liveHeartRate(LiveHeartRate.Continue)),
      LIVE_KEEPALIVE_MS,
    );
  }

  async stopLive(): Promise<void> {
    this.clearLiveTimer();
    band.set({ liveHeartRate: false });
    await this.send(cmd.liveHeartRate(LiveHeartRate.Stop));
  }

  findDevice(): Promise<void> {
    return this.send(cmd.findDevice());
  }

  /** The vendor `SetTimeReq` adds one second to cover the write latency. */
  syncTime(): Promise<void> {
    return this.send(cmd.setTime(new Date(Date.now() + 1000)));
  }

  async setHeartRateSettings(settings: HeartRateSettings): Promise<void> {
    patchSettings({ heartRate: settings });
    await this.send(cmd.writeHeartRateSettings(settings));
  }

  async setSpo2Enabled(enabled: boolean): Promise<void> {
    patchSettings({ spo2Enabled: enabled });
    await this.send(cmd.writeSpo2Settings(enabled));
  }

  async setDisplayFormat(format: DisplayFormat): Promise<void> {
    patchSettings({ displayFormat: format });
    await this.send(cmd.writeTimeFormat(format));
  }

  async setRaiseToWake(setting: RaiseToWake): Promise<void> {
    patchSettings({ raiseToWake: setting });
    await this.send(cmd.writeRaiseToWake(setting));
  }

  async setDoNotDisturb(setting: DoNotDisturb): Promise<void> {
    patchSettings({ doNotDisturb: setting });
    await this.send(cmd.writeDoNotDisturb(setting));
  }

  async setSedentary(setting: Sedentary): Promise<void> {
    patchSettings({ sedentary: setting });
    await this.send(cmd.writeSedentary(setting));
  }

  async setGoals(goals: Goals): Promise<void> {
    patchSettings({ goals });
    await this.send(cmd.writeGoals(goals));
  }

  /** Disconnects and forgets the band so it is not restored on next launch. */
  async forget(): Promise<void> {
    await this.disconnect();
    await saveAppSettings({ lastDeviceId: null });
    band.set({
      device: null,
      battery: null,
      batteryHistory: [],
      activity: null,
      heartRate: null,
      spo2: null,
      heartRateHistory: [],
      spo2History: [],
    });
  }

  async disconnect(): Promise<void> {
    this.userDisconnected = true;
    this.cancelReconnect();
    const id = this.deviceId ?? this.pendingId;
    this.pendingId = null;
    this.teardown();
    band.set({ status: "idle" });
    if (id && this.manager) {
      await this.manager.cancelDeviceConnection(id).catch(() => undefined);
    }
  }

  private handleDisconnect(): void {
    const id = this.deviceId;
    this.teardown();
    if (this.userDisconnected || !id) {
      band.set({ status: "idle" });
      return;
    }
    this.scheduleReconnect(id);
  }

  private scheduleReconnect(id: string): void {
    this.cancelReconnect();
    band.set({ status: "reconnecting" });
    const attempt = this.reconnectAttempts;
    this.reconnectAttempts += 1;
    if (!this.foreground) {
      // Timers do not run in the background. Try once right away; later
      // retries come from `backgroundTick`, so a failing attempt cannot spin.
      if (attempt === 0) void this.connect(id);
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    this.reconnectTimer = setTimeout(() => void this.connect(id), delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearLiveTimer(): void {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  private teardown(): void {
    this.clearTimers();
    this.clearLiveTimer();
    this.finishMeasurement(null, null);
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    this.deviceId = null;
    this.assembler = new LargeFrameAssembler();
    this.historyReader = new HeartRateHistoryReader();
    this.intervalPages = [];
    this.writeChain = Promise.resolve();
    band.set({ measuring: null, liveHeartRate: false });
  }
}

export const qwatch = new QWatchClient();
