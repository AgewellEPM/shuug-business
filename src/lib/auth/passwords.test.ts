import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("s3cret-owner-pw");
    expect(verifyPassword("s3cret-owner-pw", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("uses a random salt — same password hashes differently each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects malformed stored values without throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "notscrypt$aa$bb")).toBe(false);
    expect(verifyPassword("x", "scrypt$zz")).toBe(false);
  });
});
