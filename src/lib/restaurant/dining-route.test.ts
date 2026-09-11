// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GET, POST } from "@/app/api/restaurant/dining/route";
import { requireSectionAccess } from "../permissions/guard";
import { requireIdentity } from "../auth/identity";
import { emptyDining } from "./dining-model";
import { restaurantState } from "./store";
vi.mock("../permissions/guard", () => ({ requireSectionAccess: vi.fn(async () => {}) }));
vi.mock("../auth/identity", () => ({ requireIdentity: vi.fn(async () => ({ id: "staff", name: "Host", isOwner: false })) }));
let dir: string; const base = "https://restaurant.example.test";
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/shuug-dining-route-`); vi.stubEnv("DEALDESK_DATA_DIR", dir); vi.stubEnv("APP_BASE_URL", base); vi.mocked(requireSectionAccess).mockResolvedValue(); vi.mocked(requireIdentity).mockResolvedValue({ id: "staff", name: "Host", isOwner: false } as never); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const request = (action: string, input: unknown, origin = base) => new Request(base + "/api/restaurant/dining", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ requestId: randomUUID(), action, input }) });
it("denies guest records to anonymous or restricted employees and blocks cross-origin writes", async () => {
  vi.mocked(requireSectionAccess).mockRejectedValue(new Error("Denied")); expect((await GET()).status).toBe(403); expect((await POST(request("reservation.save", {}))).status).toBe(403);
  vi.mocked(requireSectionAccess).mockResolvedValue(); expect((await POST(request("settings.save", {}, "https://attacker.test"))).status).toBe(403); expect(restaurantState.read().reservations).toHaveLength(0);
});
it("requires owner identity to publish booking policies even when staff can edit the floor", async () => {
  expect((await POST(request("settings.save", emptyDining().settings))).status).toBe(400); vi.mocked(requireIdentity).mockResolvedValue({ id: "owner", name: "Owner", isOwner: true } as never); expect((await POST(request("settings.save", emptyDining().settings))).status).toBe(200);
});
