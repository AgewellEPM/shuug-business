import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer): string {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode(value: string): Buffer {
  if (!/^[A-Z2-7]{16,128}$/.test(value)) throw new Error("Invalid authenticator secret.");
  const bytes: number[] = []; let bits = 0, word = 0;
  for (const char of value) {
    word = (word << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((word >>> bits) & 255); }
  }
  return Buffer.from(bytes);
}
export const newTotpSecret = () => base32(randomBytes(20));
/** RFC 4226/6238; SHA-1, six digits and 30 seconds work with standard authenticators. */
export function totp(secret: string, counter: number, digits = 6): string {
  if (!Number.isSafeInteger(counter) || counter < 0 || ![6, 8].includes(digits)) throw new Error("Invalid authenticator counter.");
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", decode(secret)).update(message).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
export function verifyTotp(secret: string, code: string, now: number, lastCounter = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000); let found: number | null = null;
  for (const counter of [current - 1, current, current + 1]) {
    if (counter < 0) continue;
    if (timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code)) && counter > lastCounter) found = counter;
  }
  return found;
}
export function authenticatorUri(secret: string, label: string): string {
  return `otpauth://totp/${encodeURIComponent(`Shuug:${label}`)}?${new URLSearchParams({ secret, issuer: "Shuug", algorithm: "SHA1", digits: "6", period: "30" })}`;
}
