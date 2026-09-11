// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
const auth = vi.hoisted(() => ({ level: "edit" }));
vi.mock("@/lib/permissions/guard", () => ({ requireSectionAccess: async (section: string, level: string) => { if (section !== "money" || auth.level === "none" || (level === "edit" && auth.level !== "edit")) throw Error("Denied"); } }));
vi.mock("@/lib/auth/identity", () => ({ requireIdentity: async () => ({ id: "bookkeeper", name: "Synthetic bookkeeper" }) }));
import { GET, POST } from "./route";
let dir: string;
const post = (payload: unknown, origin = "http://localhost:3000") => POST(new Request("http://localhost:3000/api/accounting/journal", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(payload) }));
const command = () => ({ requestId: randomUUID(), action: "journal.post", input: { date: "2026-09-10", memo: "HTTP posting", lines: [{ accountNumber: 1000, debitCents: 1234, creditCents: 0 }, { accountNumber: 4000, debitCents: 0, creditCents: 1234 }], reviewed: true } });
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shuug-journal-api-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", "http://localhost:3000"); auth.level = "edit"; });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("persists an authenticated posting, exposes private history and rejects ambiguous repeats", async () => {
  const c = command(), response = await post(c); expect(response.status).toBe(200);
  expect(await (await post(c)).json()).toEqual(await response.json());
  expect((await post({ ...c, input: { ...c.input, memo: "Different" } })).status).toBe(400);
  const read = await GET(); expect(read.headers.get("cache-control")).toBe("private, no-store");
  const data = await read.json(); expect(data.entries).toHaveLength(1); expect(data.entries[0].manual.actor).toBe("Synthetic bookkeeper (bookkeeper)");
});
it("separates accounting view and edit access and rejects foreign or absent origins", async () => {
  auth.level = "none"; expect((await GET()).status).toBe(403); expect((await post(command())).status).toBe(403);
  auth.level = "view"; expect((await GET()).status).toBe(200); expect((await post(command())).status).toBe(403);
  auth.level = "edit"; expect((await post(command(), "https://foreign.example")).status).toBe(403); expect((await post(command(), "")).status).toBe(403);
  expect((await GET()).headers.get("cache-control")).toContain("no-store");
});
it("bounds payloads and enforces review and real calendar dates", async () => {
  for (const c of [{ ...command(), padding: "x".repeat(100001) }, { ...command(), input: { ...command().input, reviewed: false } }, { ...command(), input: { ...command().input, date: "2026-02-30" } }]) expect((await post(c)).status).toBe(400);
  expect((await (await GET()).json()).entries).toHaveLength(0);
});
