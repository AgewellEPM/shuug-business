import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

let dir = "";
function freshCache() { (globalThis as unknown as { __team?: unknown }).__team = undefined; }
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "dd-team-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); freshCache(); });
afterEach(() => { vi.unstubAllEnvs(); freshCache(); rmSync(dir, { recursive: true, force: true }); });

describe("team CRUD + durability", () => {
  it("adds a member with a unique id, initials and survives a restart", async () => {
    const s1 = await import("./store");
    const m = s1.addMember({ name: "Riley Fox", email: "riley@shuug.co", role: "Sales", online: true });
    expect(m.id).toBe("riley-fox");
    expect(m.initials).toBe("RF");

    freshCache(); // simulate restart
    const s2 = await import("./store");
    expect(s2.listTeam().some((x) => x.id === "riley-fox")).toBe(true);
  });

  it("uniquifies colliding ids", async () => {
    const s = await import("./store");
    const a = s.addMember({ name: "Casey Ray", email: "c1@shuug.co", role: "Sales" });
    expect(a.id).toBe("casey-ray");
    const b = s.addMember({ name: "Casey Ray", email: "c2@shuug.co", role: "Sales" });
    expect(b.id).toBe("casey-ray-2");
  });

  it("edits a member and recomputes initials", async () => {
    const s = await import("./store");
    const m = s.addMember({ name: "Pat Lee", email: "pat@shuug.co", role: "Viewer" });
    const up = s.updateMember(m.id, { name: "Patricia Lee", role: "Manager" });
    expect(up.name).toBe("Patricia Lee");
    expect(up.initials).toBe("PL");
    expect(up.role).toBe("Manager");
  });

  it("removes a member but never the owner", async () => {
    const s = await import("./store");
    const m = s.addMember({ name: "Temp Worker", email: "t@shuug.co", role: "Viewer" });
    s.removeMember(m.id);
    expect(s.listTeam().some((x) => x.id === m.id)).toBe(false);
    expect(() => s.removeMember("owner")).toThrow(/owner/i);
  });
});
