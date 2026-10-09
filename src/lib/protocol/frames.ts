import { readUintLE, writeUintLE } from "./bytes";

/** Every command-channel frame is 16 bytes: key, 14 payload bytes, checksum. */
export const COMMAND_FRAME_LENGTH = 16;
const COMMAND_PAYLOAD_LENGTH = 14;
/** The band sets this bit on the key byte when a command failed. */
const ERROR_FLAG = 0x80;

/** Large-data frames start with this magic byte. */
const LARGE_FRAME_MAGIC = 0xbc;
const LARGE_FRAME_HEADER_LENGTH = 6;

export function buildCommand(
  key: number,
  payload: readonly number[],
): Uint8Array {
  const frame = new Uint8Array(COMMAND_FRAME_LENGTH);
  frame[0] = key & 0xff;
  payload.slice(0, COMMAND_PAYLOAD_LENGTH).forEach((byte, index) => {
    frame[index + 1] = byte & 0xff;
  });
  frame[COMMAND_FRAME_LENGTH - 1] = checksum(frame);
  return frame;
}

/** Sum of bytes 0..14, truncated to 8 bits. */
function checksum(frame: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length - 1; i++) {
    sum += frame[i] ?? 0;
  }
  return sum & 0xff;
}

export type CommandFrame = {
  key: number;
  failed: boolean;
  /** Bytes 1..14 of the frame. Response offsets in the decoders index into this. */
  payload: Uint8Array;
};

export function parseCommandFrame(frame: Uint8Array): CommandFrame | null {
  // The vendor SDK dispatches without verifying the checksum, so we do too.
  if (frame.length !== COMMAND_FRAME_LENGTH) return null;
  const head = frame[0] ?? 0;
  return {
    key: head & ~ERROR_FLAG & 0xff,
    failed: (head & ERROR_FLAG) !== 0,
    payload: frame.slice(1, COMMAND_FRAME_LENGTH - 1),
  };
}

/** CRC-16/MODBUS (init 0xFFFF, reflected poly 0xA001), as in the vendor `CRC16` class. */
export function crc16(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0xffff;
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

/** `BC action len(LE16) crc16(LE16) payload...`; empty payloads carry CRC `FF FF`. */
export function buildLargeFrame(
  action: number,
  payload: readonly number[],
): Uint8Array {
  const body = Uint8Array.from(payload, (byte) => byte & 0xff);
  const frame = new Uint8Array(LARGE_FRAME_HEADER_LENGTH + body.length);
  frame[0] = LARGE_FRAME_MAGIC;
  frame[1] = action & 0xff;
  frame.set(writeUintLE(body.length, 2), 2);
  frame.set(body.length > 0 ? writeUintLE(crc16(body), 2) : [0xff, 0xff], 4);
  frame.set(body, LARGE_FRAME_HEADER_LENGTH);
  return frame;
}

export type LargeFrame = {
  action: number;
  /** The whole frame, header included; vendor decoders index from byte 0. */
  bytes: Uint8Array;
};

/**
 * Reassembles large-data notifications. A frame may span several BLE
 * notifications; continuation chunks carry no header.
 */
export class LargeFrameAssembler {
  private buffer = new Uint8Array(0);
  private expectedLength = 0;

  push(chunk: Uint8Array): LargeFrame | null {
    if (
      chunk.length >= LARGE_FRAME_HEADER_LENGTH &&
      chunk[0] === LARGE_FRAME_MAGIC
    ) {
      this.expectedLength = readUintLE(chunk, 2, 2);
      this.buffer = chunk.slice();
    } else if (this.buffer.length > 0) {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    } else {
      return null;
    }

    if (this.buffer.length - LARGE_FRAME_HEADER_LENGTH < this.expectedLength) {
      return null;
    }
    const bytes = this.buffer;
    this.buffer = new Uint8Array(0);
    return { action: bytes[1] ?? 0, bytes };
  }
}
