import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { configureOwnerPassword, signInOwner, signOutOwner, ownerSessionValid } from "./owner-session";
let dir: string; const previous = process.env.DEALDESK_DATA_DIR;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/owner-session-test-`); process.env.DEALDESK_DATA_DIR = dir; });
afterEach(() => { if (previous === undefined) delete process.env.DEALDESK_DATA_DIR; else process.env.DEALDESK_DATA_DIR = previous; rmSync(dir, { recursive: true, force: true }); });
it("requires setup, hashes credentials, persists sessions and revokes them on rotation", () => {
  expect(() => signInOwner("wrong")).toThrow("setup");
  configureOwnerPassword("test-owner-password-12345");
  const token = signInOwner("test-owner-password-12345");
  expect(ownerSessionValid(token)).toBe(true);
  expect(ownerSessionValid("forged-token")).toBe(false);
  signOutOwner(token); expect(ownerSessionValid(token)).toBe(false);
  const second = signInOwner("test-owner-password-12345");
  configureOwnerPassword("replacement-password-12345", true);
  expect(ownerSessionValid(second)).toBe(false);
  expect(() => signInOwner("test-owner-password-12345")).toThrow("Incorrect");
});
it("stores failed attempts so another process cannot reset the rate limit", () => {
  configureOwnerPassword("test-owner-password-12345");
  for (let i = 0; i < 8; i++) expect(() => signInOwner("wrong")).toThrow("Incorrect");
  expect(() => signInOwner("test-owner-password-12345")).toThrow("Too many");
});
