/**
 * Local encryption — AES-256-GCM with a key derived from your passphrase via
 * scrypt. This is what makes the on-device database unreadable from the outside:
 * the file on disk is ciphertext, and without your passphrase it's noise. GCM's
 * auth tag means any tampering is detected (decrypt throws). Pure Node crypto.
 *
 * Blob layout (base64): [salt:16][iv:12][tag:16][ciphertext].
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  if (!passphrase) throw new Error("A passphrase is required to encrypt local data.");
  return scryptSync(passphrase, salt, KEY_LEN);
}

/** Encrypt a UTF-8 string. Fresh random salt + IV every call. */
export function encrypt(plaintext: string, passphrase: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

/** Decrypt a blob. Throws on a wrong passphrase or any tampering (GCM auth). */
export function decrypt(blob: string, passphrase: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) throw new Error("Corrupt or truncated encrypted data.");
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
