import { requireOptionalNativeModule, type NativeModule } from "expo";

type Events = {
  onTick: (event: { at: number }) => void;
};

declare class QWatchBackgroundModule extends NativeModule<Events> {
  startService(title: string, text: string): boolean;
  updateService(title: string, text: string): void;
  stopService(): void;
  startTicker(seconds: number): void;
  stopTicker(): void;
}

/** Android only; `null` on iOS, web and Expo Go. */
export const QWatchBackground =
  requireOptionalNativeModule<QWatchBackgroundModule>("QWatchBackground");
