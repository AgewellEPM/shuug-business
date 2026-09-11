import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCollection, loadCollection, localDbEnabled, localDbStatus } from "./store";

const TMP = join(tmpdir(), `shuug-localdb-test-${process.pid}.enc`);

describe("local encrypted store", () => {
  beforeEach(() => {
    process.env.LOCAL_DB_PASSPHRASE = "test-pass-123";
    process.env.LOCAL_DB_PATH = TMP;
  });
  afterEach(() => {
    delete process.env.LOCAL_DB_PASSPHRASE;
    delete process.env.LOCAL_DB_PATH;
  });

  it("saves and loads a collection through an encrypted file", () => {
    const records = [{ id: "c1", company: "Joe's Market" }, { id: "c2", company: "Big Y" }];
    saveCollection("customers", records);
    expect(loadCollection("customers")).toEqual(records);
  });

  it("writes ciphertext to disk (not readable plaintext)", () => {
    saveCollection("secret", [{ price: "wholesale-secret-value" }]);
    const onDisk = readFileSync(TMP, "utf8");
    expect(onDisk).not.toContain("wholesale-secret-value");
    expect(onDisk).not.toContain("secret");
  });

  it("reports enabled + path in status", () => {
    saveCollection("x", [1]);
    const s = localDbStatus();
    expect(s.enabled).toBe(true);
    expect(s.path).toBe(TMP);
    expect(s.exists).toBe(true);
  });

  it("is off (and empty) with no passphrase", () => {
    delete process.env.LOCAL_DB_PASSPHRASE;
    expect(localDbEnabled()).toBe(false);
    expect(loadCollection("customers")).toEqual([]);
    expect(() => saveCollection("customers", [1])).toThrow();
  });
});
