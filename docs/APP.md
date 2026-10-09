# App architecture

## Layout

```
src/
  app/                    expo-router routes
    _layout.tsx           fonts, settings load, band restore, uploader, alerts, background
    (tabs)/_layout.tsx    custom neobrutal tab bar (expo-router/ui headless tabs)
    (tabs)/index.tsx      Today: connection, battery, steps, HR, SpO2, history charts
    (tabs)/band.tsx       Band settings (monitoring, goals, display, quiet time, device)
    (tabs)/settings.tsx   Settings: background, reading alerts, server upload
    connect.tsx           Band scanner (modal)
  components/             shared composites: Screen, BatteryCard, ConnectionCard, HourlyChart
  components/ui/          shadcn-style primitives, one per file (button, card, switch, …)
  lib/protocol/           pure byte-level code: frames, request builders, decoders
  lib/ble/                react-native-ble-plx client, permissions, UUIDs, scan filter
  lib/store/              tiny useSyncExternalStore stores (band state, app settings)
  lib/upload/             JSON POST to the user's server
  lib/alerts/             local notifications for low/high HR and low SpO2
  lib/background/         app-state wiring, Android service, native tick
  lib/theme.ts, utils.ts  colour tokens for props, `cn` / `tv` helpers
modules/qwatch-background/  local Expo module (Android): foreground service + tick
```

## Data flow

1. `qwatch` (`lib/ble/client.ts`) is a single `BleManager` wrapper. It runs the
   vendor handshake, as described in [PROTOCOL.md](PROTOCOL.md).
2. All writes go through one promise chain, because the band handles one
   request at a time.
3. Notifications are decoded into `CommandEvent`s or large frames. The decoded
   values are written into the `band` store.
4. Polling while connected and in the foreground:
   - steps every 60 s
   - battery every 5 min
   - HR and SpO2 history every 10 min, plus whenever the band sends a key 115
     push
5. If the link drops unexpectedly in the foreground, the client reconnects
   with exponential backoff (5 s up to 60 s). In the background it uses
   `autoConnect` instead; see [Background](#background).
6. The last device id is saved, so the app reconnects to it on launch.
7. Screens read from the stores with `store.useSelector(selector)`.

## Readings

- **Heart rate.** Comes from a manual measurement (key 105), from live mode
  (key 30), or from the newest sample in the day's history. Whichever is
  newest wins. The card shows a pill saying where the value came from.
  A value only counts while it is recent: it goes stale after the longer of
  30 min and two of the band's heart-rate intervals plus 5 min. A live reading
  of 0, or a failed manual measurement (not worn, timed out), clears it at
  once. With automatic heart rate off on the band, the last measured value
  never goes stale.
- **SpO2.** Comes from a manual measurement, or from the last hour in the
  action 42 history. It goes stale like heart rate, using a 60 min interval
  (125 min), since the band writes one entry per hour. A failed manual
  measurement clears it, and with automatic SpO2 off the last value stays.
- Stale or missing readings show as `--` on the cards and in the notification,
  and are sent as `null` in the upload.
- **Battery.** Each poll is stored in a rolling 24 h `batteryHistory`. The
  drain rate is calculated from the samples since the band last stopped
  charging, and needs at least 30 minutes of them. The card then shows
  `%/h` and the estimated time left.

## Scanner

`connect.tsx` mirrors the vendor bind screen (`DeviceBindActivity`,
`BleScannerHelper`):

- It scans for 12 s with no service filter, at low latency, sorted by signal.
- It stops early once more than 20 bands are listed.
- Bands already connected to the phone don't advertise. They are added first
  from the OS connection list (`connectedDevices` with the command service) and
  marked **paired**.
- A device counts as a band when its name starts with one of the vendor's
  prefixes (`lib/ble/scanFilter.ts`), or when it advertises the command or
  large-data service. The prefix list combines three vendor sources: the
  hard-coded prefixes, the default server-configurable list in
  `QCApplication`, and `sFILTER_PREFIX`.
- **Show all Bluetooth devices** lists every named advertiser, in case a band
  uses a name that isn't covered.

## Background

The app works like a normal watch companion: once a band is connected, it
stays connected after the app is closed. It is built to cost as little battery
as possible:

- **No polling in the background.** The steps, battery and history timers stop
  and live heart rate is switched off. On Android the client also asks for a
  low-power connection interval (`ConnectionPriority.LowPower`), and switches
  back to `Balanced` when the app returns.
- **Event driven.** The band pushes key 115 when it records a new HR or SpO2
  sample. That BLE notification is handled at once, which re-reads the history
  and runs the alert check.
- **One coarse tick (Android).** React Native pauses JS timers in the
  background. The local module `modules/qwatch-background` posts a single
  main-looper callback instead. It takes no wake lock, so in Doze it waits for
  the next maintenance window. The tick fires every upload interval, or every
  heart-rate interval (5–30 min) if that is shorter. Uploads off: every
  heart-rate interval, at most every 15 min. Each tick:
  - retries a dropped link;
  - re-reads band data once per heart-rate interval;
  - runs the upload check.
- **Foreground service (Android).** A `connectedDevice` foreground service
  keeps the process, and with it the BLE link, alive. It shows a low-importance
  notification. Its title is the band name and battery level. Its text is the
  latest heart rate, blood oxygen and steps, such as
  `♥ 72 bpm · O₂ 98% · 6,400 steps`, and updates in place as readings arrive,
  including after the app is swiped from recents. Android 12+ only lets the
  service start while the app is visible, so it starts when a band connects and
  keeps running through reconnects. It stops when you disconnect or forget the
  band, or turn off **Stay connected**.
- **Reconnects.** In the background a dropped link is retried once with
  `autoConnect` and no timeout. The OS then waits for the band at a low scan
  duty and finishes the connection when it comes back in range. Further
  retries only come from the tick, so a failing attempt cannot spin.
- **iOS.** `bluetooth-central` background mode and a restore identifier
  (`qwatch-band`) are enabled. iOS wakes the app for BLE notifications from the
  band; the alert and upload checks run then. iOS has no tick: if the band
  pushes nothing, the app stays asleep.

## Alerts

Turn on **Reading alerts** in **Settings**. Defaults: heart rate below
50 bpm, blood oxygen below 92 %. The **High heart rate** alert is off until you
turn it on, so workouts don't notify anyone who never asked. It then starts at
120 bpm.

- The check runs on every new reading: manual, live, and every new history
  sample.
- Live readings and history are checked separately. A manual reading at 14:00
  therefore doesn't hide a 13:40 history sample that arrives on a later sync.
- Samples older than an hour never alert, for example on the first sync of the
  day.
- For SpO2 history, each hour's _highest_ value is used. An alert means the
  whole hour was low, which keeps motion artefacts out.
- High heart rate uses the highest fresh sample, and the low limits use the
  lowest.
- After an alert, the same limit waits 30 min before alerting again. Low and
  high heart rate are tracked separately.
- These are phone notifications. The band's own **High HR alert** (Band tab)
  only vibrates the band.
- Alerts are local notifications (`expo-notifications`). On Android they use
  the high-importance "Health alerts" channel. Permission is requested when you
  turn the switch on.

## Remote upload

Turn it on in **Settings**, then set:

- **URL**: must be `http(s)`.
- **Interval**: at least 15 s.
- **Bearer token**: optional. It is sent as `Authorization: Bearer <token>`.

The app sends `POST <url>` with `Content-Type: application/json`:

```json
{
  "source": "qwatch-pro-oss",
  "version": 1,
  "sentAt": "2026-10-09T08:00:00.000Z",
  "connected": true,
  "device": {
    "id": "AA:BB:…",
    "name": "Q_xxxx",
    "firmware": "…",
    "hardware": "…"
  },
  "battery": { "percent": 82, "charging": false, "drainPerHour": 1.2 },
  "heartRate": { "value": 72, "measuredAt": "…", "source": "manual" },
  "spo2": { "value": 98, "measuredAt": "…", "source": "history" },
  "steps": {
    "total": 6400,
    "running": 120,
    "kcal": 230,
    "distanceMeters": 4300,
    "activeMinutes": 41,
    "goal": 8000,
    "updatedAt": "…"
  },
  "history": {
    "heartRate": [{ "minute": 485, "bpm": 71 }],
    "spo2": [{ "hour": 8, "min": 95, "max": 99 }]
  }
}
```

- When the band has no data for a section, or its `heartRate` or `spo2`
  reading is no longer current (see Readings), that section is `null`. A stale
  value is never sent.
- `history.heartRate[].minute` counts from local midnight.
- `source` is one of `manual`, `live` or `history`.
- The **Last upload** card shows the HTTP status or the error.
- **Send test** saves your edits and uploads once right away.
- The payload preview shows the exact body.

### Schedule

- **Foreground:** a JS interval at the configured period.
- **Background on Android:** the native tick.
- **Background on iOS:** whenever a band notification wakes the app and the
  interval has passed.
- In the background an upload is skipped when the payload, ignoring `sentAt`,
  matches the last delivered one. A heartbeat still goes out at least every
  15 min. An idle band therefore costs no network.

### Limitations

- In Doze, Android delays the tick to its maintenance windows. A band push
  still wakes the app, though.
- On iOS, background uploads depend on the band waking the app.
- `usesCleartextTraffic` (Android) and `NSAllowsArbitraryLoads` (iOS) are on,
  so plain `http://` LAN servers work.

## UI

The style is neobrutalist: 2 px ink (`#2b2118`) outlines, hard offset shadows
(`boxShadow`), large rounded corners (`rounded-2xl`/`3xl`), and pastel fills on
a cream (`#fff6e5`) background. The font is Space Grotesk.

- Styling is Tailwind classes only (Uniwind). Inline `style` is kept for
  values computed at runtime: safe-area insets, the radar animation, and
  Reanimated styles.
- Tokens live in `src/global.css` (`@theme`):
  - colours (`bg-butter`, `border-ink`, …)
  - hard shadows (`shadow-brutal`, `-md`, `-sm`, `-xs`)
  - fonts (`font-grotesk`, `-medium`, `-bold`)
- `src/lib/theme.ts` holds JS copies of the colours, for props that take a
  colour value, such as icons and placeholders.
- `src/components/ui/` holds the primitives, shadcn style with one file each:
  `button` (variants via `tailwind-variants`), `card` (+ `CardHeader`),
  `badge`, `switch`, `input`, `pressable-surface`, `animated`, `segmented`, `stepper`, `row`, `separator`,
  `section-title`, `icon`, `icon-badge`, `text`.
- Motion follows the Material 3 Expressive spring tokens in
  `src/lib/motion.ts`. Spatial springs (which can bounce) are for movement and
  shape, and effects springs are for colour and opacity.
  - `PressableSurface` is the base for every tappable surface. On press it
    sinks into its shadow, shrinks a little and squares its corners.
  - Switches slide and grow the thumb; segment and tab pills spring in.
  - Steppers bump in the direction of the change.
  - Chart bars grow into place, and the battery bars fill in.
  - Scan results slide in and glide when the list re-sorts.
  - Reanimated skips springs when the system "reduce motion" setting is on.
- `cn()` in `src/lib/utils.ts` merges classes with tailwind-merge. It is
  configured with the custom tokens, so `className` overrides work.
- Composites shared across screens live in `src/components/`.
- Settings are optimistic. The store updates right away, then the write is
  sent. **Reload** on the Band tab re-reads everything from the band.

## Running

BLE and the background module need a development build. Expo Go does not
include `react-native-ble-plx`, and the native module is compiled into the app.

```bash
bun install
bun run android   # or: bun run ios
```

After changing `app.json` or anything in `modules/`, rebuild the native app
(`bun run android`). A Metro reload is not enough.
