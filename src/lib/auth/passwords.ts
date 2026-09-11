/**
 * Password hashing — scrypt (memory-hard) with a per-password random salt and a
 * constant-time compare. Format: `scrypt$<saltHex>$<hashHex>`. Pure crypto, no
 * I/O — trivially testable. Never store or log the plaintext.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const dk = scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN);
  return timingSafeEqual(dk, expected);
}
