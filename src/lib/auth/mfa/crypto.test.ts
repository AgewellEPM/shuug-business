// @vitest-environment node
import { expect, it } from "vitest";
import { base32, totp, verifyTotp } from "./crypto";
it("matches all SHA-1 reference vectors from RFC 6238 appendix B", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [seconds, code] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]] as const) expect(totp(secret, Math.floor(seconds/30), 8)).toBe(code);
});
it("allows only bounded time drift and never accepts a previously consumed counter", () => {
  const secret = base32(Buffer.from("12345678901234567890")), now = 1234567890000, counter = Math.floor(now/30000);
  for (const offset of [-1,0,1]) expect(verifyTotp(secret,totp(secret,counter+offset),now)).toBe(counter+offset);
  expect(verifyTotp(secret,totp(secret,counter-2),now)).toBeNull();
  expect(verifyTotp(secret,totp(secret,counter),now,counter)).toBeNull();
  expect(verifyTotp(secret,"12345x",now)).toBeNull();
});
