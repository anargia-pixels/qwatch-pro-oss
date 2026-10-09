/** Byte helpers shared by the command and large-data channels. */

export function toBcd(value: number): number {
  return ((Math.floor(value / 10) << 4) | (value % 10)) & 0xff;
}

export function fromBcd(byte: number): number {
  return ((byte >> 4) & 0x0f) * 10 + (byte & 0x0f);
}

export function readUintBE(
  bytes: Uint8Array,
  offset: number,
  length: number,
): number {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = value * 256 + (bytes[offset + i] ?? 0);
  }
  return value;
}

export function readUintLE(
  bytes: Uint8Array,
  offset: number,
  length: number,
): number {
  let value = 0;
  for (let i = length - 1; i >= 0; i--) {
    value = value * 256 + (bytes[offset + i] ?? 0);
  }
  return value;
}

export function writeUintLE(value: number, length: number): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(value));
  for (let i = 0; i < length; i++) {
    out.push(rest & 0xff);
    rest = Math.floor(rest / 256);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    " ",
  );
}
