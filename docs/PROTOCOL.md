# QWatch Pro BLE protocol

This is how the QWatch Pro app (`com.qcwireless.qcwatch` 1.0.2.99, vendor SDK
`com.oudmon.ble`) talks to its bands. It was worked out from the decompiled
APK, and every offset below was checked against the SDK sources. The code that
implements it lives in `src/lib/protocol/`.

Byte offsets in response tables are **payload offsets**, meaning frame bytes
1–14 unless a table says otherwise.

## GATT

| Purpose           | Service                                | Characteristic                                         |
| ----------------- | -------------------------------------- | ------------------------------------------------------ |
| Command write     | `6e40fff0-b5a3-f393-e0a9-e50e24dcca9e` | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` (with response) |
| Command notify    | same                                   | `6e400003-b5a3-f393-e0a9-e50e24dcca9e`                 |
| Large-data notify | `de5bf728-d711-4e47-af26-65e3012a5dc7` | `de5bf729-d711-4e47-af26-65e3012a5dc7`                 |
| Large-data write  | same                                   | `de5bf72a-d711-4e47-af26-65e3012a5dc7` (no response)   |
| Device info       | `0x180A`                               | firmware `0x2A26`, hardware `0x2A27`                   |

The vendor scanner filters on advertised names only; there is no service
UUID filter. A name passes when it starts with one of these:

- a hard-coded prefix: `O_`, `o_`, `Q_`, `q_`, `R3L`, `QC`, `qc` or `Wa`;
- an entry in a server-configurable list (default in `QCApplication`);
- an entry in `sFILTER_PREFIX`.

The full list is in `src/lib/ble/scanFilter.ts`. Scans last 12 s. The app
requests an MTU of 247.

## Command frames

Every command frame is exactly 16 bytes:

```
[key] [14 payload bytes, zero padded] [checksum = sum(bytes 0..14) & 0xFF]
```

- In a response, `key & 0x80` set means the command **failed**. The real key
  is `key & 0x7F`.
- The SDK does **not** verify the checksum on received frames.
- Many settings follow a read/write pattern. Payload byte 0 is `1` to read and
  `2` to write. Replies to a read echo `1` in payload byte 0.

## Large-data frames

```
0xBC [action] [len LE16] [crc LE16] [payload…]
```

- `crc` is **CRC-16/MODBUS** (init `0xFFFF`, reflected poly `0xA001`) over the
  payload. An empty payload carries `FF FF`.
- A reply can span several notifications. A chunk that starts with `0xBC` and
  is at least 6 bytes long begins a new frame. Later chunks are appended until
  `received − 6 ≥ len`.
- Large-data decoders index from **byte 0 of the whole frame**, header
  included.

## Connect sequence (as the vendor app does it)

1. Enable command notifications.
2. Read the hardware revision, then the firmware revision.
3. Enable large-data notifications.
4. `SetTime` (key 1).
5. `DeviceSupport` (key 60), then `Battery` (key 3).
6. Read the settings: HR 22, SpO2 44, palm 5, time format 10, DND 6, goals 33,
   sedentary 38.

## Commands used

### Time — key 1

Request: BCD `yy MM dd HH mm ss`, then language (`1` = English), then a zone
byte `((utcOffsetHours + 24) % 24) * 2 + 1`. The vendor adds one second to
cover write latency.

| Reply bit     | Meaning               |
| ------------- | --------------------- |
| `p[1] & 0x40` | supports heart rate   |
| `p[3] & 0x02` | supports blood oxygen |

### Battery — key 3

The request has no payload. Reply: `p[0]` is the percentage, and `p[1] == 1`
means charging.

### Device support — key 60

The request has no payload. `p[7] & 0x08` means the band supports interval
heart rate over large-data action 117. Bands without it use key 21 instead.

### Today's activity — key 72

The request has no payload. Every value in the reply is **big-endian**:

| Offset | Size | Field                                 |
| ------ | ---- | ------------------------------------- |
| 0      | 3    | total steps                           |
| 3      | 3    | running steps                         |
| 6      | 3    | calories, in small cal (÷1000 = kcal) |
| 9      | 3    | distance in metres                    |
| 12     | 2    | active minutes                        |

### Manual measurement — key 105 (start) / key 106 (stop)

- Start: `[type, sub]`. Types are heart rate `1`, blood pressure `2` and SpO2
  `3`. The sub byte is `0` for types below 3, otherwise BCD 25 (`0x25`).
- Replies stream in as `p[0]` type, `p[1]` error, `p[2]` value. Error `0` means
  ok and `1` means the band is not worn properly; any other value aborts.
- Take the first reply with error `0` and value `> 0`. Then send stop:
  `[type, lastValue, 0]`. The vendor UI counts down 25 s.

### Live heart rate — key 30

`[1]` starts, `[2]` stops and `[3]` continues. The band stops on its own unless
it gets a "continue" about every 20 s. Each reply carries `p[0]` = bpm.

### Device push — key 115

The band sends this unprompted. `p[0]` says what changed: `1` heart rate,
`2` blood pressure, `3` SpO2, `4` steps, `16` goals. The app re-reads the
matching data.

### Find device — key 80

Request `[0x55, 0xAA]` makes the band vibrate.

## Settings

| Setting        | Key     | Write payload                                                                          | Read reply                                                                   |
| -------------- | ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Interval HR    | 22      | `[2, on?1:2, intervalMin, start, low, high]`                                           | `p[1]==1` on, `p[2]` interval, `p[3]` start (0 → 5), `p[4]` low, `p[5]` high |
| All-day SpO2   | 44      | `[2, on?1:0]`                                                                          | `p[1]==1`                                                                    |
| Time/units     | 10      | `[2, is24h?0:1, metric?0:1]`                                                           | `p[1]==0` 24h, `p[2]==0` metric                                              |
| Raise to wake  | 5       | `[2, on?1:2, (left?1:2) \| 4]`                                                         | `p[1]==1` on, `p[2]&1` left wrist                                            |
| Do not disturb | 6       | `[2, on?1:2, sh, sm, eh, em]`                                                          | same layout from `p[1]`                                                      |
| Goals          | 33      | `[2, steps LE3, smallCal LE3, metres LE3, activeMin LE2, sleepMin LE2]`                | same layout, **little-endian**                                               |
| Move reminder  | 37 / 38 | write key 37: BCD `sh sm eh em`, week mask (`0x7F` every day, `0` off), cycle 30/60/90 | key 38, no payload; same layout, BCD                                         |

Note the "off" value for HR, palm and DND is `2`, not `0`.

## History

### Heart rate, older bands — key 21

- Request: 4-byte LE of local midnight, as "local time read as UTC" seconds.
- The reply is several frames, keyed by `p[0]`:
  - `0`: `p[1]` is the frame count and `p[2]` the interval in minutes.
  - `1`: `p[1..4]` is a timestamp, then 9 samples in `p[5..13]`.
  - `n`: 13 samples each.
- The reply ends at frame `count − 1`, or with `p[0] == 0xFF` (no data).
- Sample `i` was taken at minute `i × interval`. A value of `0` means no
  reading.

### Heart rate, newer bands — large-data action 117

- Request: `[dayOffset, packetIndex]`.
- Reply (whole-frame offsets): `[7]` interval, `[8]` packet count, `[9]` packet
  index, then one bpm value per byte from `[10]`.
- If the count is 0 there is no data. Request `index + 1` until
  `index == count − 1`.

### Blood oxygen — large-data action 42

- Request: `[dayOffset]`.
- The reply holds `len / 49` records, each starting at `6 + i × 49`. Byte 0 of
  a record is its day offset. It is followed by 24 hourly pairs: max at odd
  offsets, min at even.

### Manual heart rate — large-data action 40

- Request `[0]` for today, or `[0xFF]` otherwise.
- From `[7]`, the reply holds 3-byte records: minute of day (LE16), then bpm.
- This is decoded but not requested yet.

## Corrections to the earlier notes

The old `QWATCH_PRO_BLE_PROTOCOL.md` got these wrong:

- Time is BCD and carries language and zone bytes; it is not plain decimal.
- The large-data CRC is MODBUS, not CCITT.
- The SpO2 start sub byte is `0x25`, not `0x19`.
- Today's steps are big-endian, but goals are little-endian.
- The "disabled" value for the HR setting is `2`.
