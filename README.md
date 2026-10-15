# QWatch OSS

An open-source companion app for **QWatch Pro** smart bands. It talks to the
band directly over Bluetooth LE using the vendor protocol, reverse-engineered
from the official app. There is no account, cloud, or tracking. Your readings
stay on your phone unless you point them at your own server.

Built with [Expo](https://expo.dev) and React Native for Android and iOS.

> [!NOTE]
> This is an independent project. It is not affiliated with or endorsed by the
> band's maker, and it is **not a medical device**. Don't rely on its readings
> or alerts for medical decisions.

## Features

**Today**

- Heart rate, blood oxygen (SpO2), steps, distance, calories and active
  minutes.
- Hourly heart rate and SpO2 charts.
- Battery level, with an estimate of the drain and hours left.
- Measure heart rate or SpO2 on demand, or stream heart rate live.

**Band**

- Interval heart rate (5–30 min) and the band's own high heart rate alert.
- All-day SpO2.
- Step goal, 12/24 h clock and units.
- Raise to wake, wrist, do not disturb and move reminder.
- Time sync and find band.

**Settings**

- **Stay connected in the background.** On Android, a foreground service keeps
  the band linked like a watch app, at a tiny battery cost. The notification
  shows the latest heart rate, SpO2 and steps.
- **Reading alerts.** Get a phone notification when your heart rate drops below
  or rises above your limits, or when your blood oxygen drops below yours.
- **Upload to your own server.** POST every reading as JSON to any HTTP
  endpoint at a set interval, with an optional bearer token.

**Scanner**

- Finds QWatch-family bands using the vendor's own name filter.
- Also lists bands that are already paired, and can show every Bluetooth
  device.

The UI is neobrutalist, in pastels on cream, with springy Material 3 Expressive
microanimations.

## Requirements

- [Bun](https://bun.sh).
- **Android:** Android Studio or the Android SDK, and JDK 17.
- **iOS:** Xcode on macOS.
- A real phone. Bluetooth doesn't work in emulators, and Expo Go can't connect
  to the band, so you need a
  [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## Getting started

```bash
bun install
bun run android   # or: bun run ios
```

This generates the native projects from `app.json`, builds the app and
installs it on the connected phone. After that, `bun run start` serves
JavaScript changes to it.

1. Open the app and tap **Connect**.
2. Tap the band's screen to wake it.
3. Pick it from the list.

### Release build (Android)

```bash
bunx expo prebuild --platform android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

The generated project signs release builds with the debug key. To distribute
the app, configure your own keystore; see
[Signed APKs](https://reactnative.dev/docs/signed-apk-android).

## Project layout

```
src/
  app/                  screens (Expo Router): Today, Band, Settings, scanner
  components/           shared composites (cards, charts, screen shell)
  components/ui/        UI primitives (button, switch, stepper, …)
  lib/protocol/         band protocol: frames, commands, decoders
  lib/ble/              BLE client: scan, connect, handshake, reconnect
  lib/store/            app and band state, persisted settings
  lib/alerts/           local notifications for reading limits
  lib/upload/           HTTP upload of readings
  lib/background/       background mode, Android foreground service
modules/qwatch-background/   Kotlin Expo module: foreground service and tick
tools/oxlint/                custom lint rules
docs/                        protocol and app documentation
```

## Docs

- [docs/PROTOCOL.md](docs/PROTOCOL.md): the BLE protocol, including frames,
  commands, settings and history transfers.
- [docs/APP.md](docs/APP.md): architecture, the scanner, background mode,
  alerts, the upload payload and the UI kit.

## Scripts

| Script                 | Description                       |
| ---------------------- | --------------------------------- |
| `bun run start`        | Start the Expo dev server         |
| `bun run android`      | Build and run on Android          |
| `bun run ios`          | Build and run on iOS              |
| `bun run typecheck`    | Type-check with tsc               |
| `bun run lint`         | Lint with oxlint                  |
| `bun run format`       | Format with oxfmt                 |
| `bun run format:check` | Check formatting without changing |

## Tech stack

- Expo SDK 57 and React Native 0.86 (New Architecture), with the React
  Compiler.
- Expo Router for navigation.
- `react-native-ble-plx` for Bluetooth LE.
- Uniwind (Tailwind CSS) for styling, plus `tailwind-variants` and
  `tailwind-merge`.
- Reanimated 4 for animations.
- `expo-notifications` for alerts.

## Contributing

Issues and pull requests are welcome. Before opening a PR, run:

```bash
bun run typecheck && bun run lint && bun run format:check
```

If you have a different QWatch-family band and something doesn't work, open an
issue with the band's name and firmware version, shown on the Band tab.

## License

[Apache License 2.0](LICENSE). The protocol was reverse-engineered from the
vendor's app; no vendor code or assets are included.
