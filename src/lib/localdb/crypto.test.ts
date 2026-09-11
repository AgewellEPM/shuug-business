import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

const PASS = "correct horse battery staple";

describe("local encryption (AES-256-GCM)", () => {
  it("round-trips a payload", () => {
    const data = JSON.stringify({ customers: 42, secret: "wholesale prices" });
    const blob = encrypt(data, PASS);
    expect(blob).not.toContain("wholesale"); // ciphertext, not plaintext
    expect(decrypt(blob, PASS)).toBe(data);
  });

  it("produces different ciphertext each time (random salt/iv)", () => {
    expect(encrypt("same", PASS)).not.toBe(encrypt("same", PASS));
  });

  it("fails to decrypt with the wrong passphrase", () => {
    const blob = encrypt("top secret", PASS);
    expect(() => decrypt(blob, "wrong passphrase")).toThrow();
  });

  it("detects tampering (auth tag)", () => {
    const blob = encrypt("integrity matters", PASS);
    const buf = Buffer.from(blob, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decrypt(buf.toString("base64"), PASS)).toThrow();
  });

  it("rejects truncated blobs and empty passphrase", () => {
    expect(() => decrypt("AAAA", PASS)).toThrow();
    expect(() => encrypt("x", "")).toThrow();
  });
});
