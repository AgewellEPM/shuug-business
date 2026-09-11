import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

/**
 * Durable permissions: admin edits must survive a restart. We isolate the data
 * dir + reset the globalThis cache to simulate a fresh process.
 */
let dir = "";
function freshCache() { (globalThis as unknown as { __perms?: unknown }).__perms = undefined; }

beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "dd-perms-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); freshCache(); });
afterEach(() => { vi.unstubAllEnvs(); freshCache(); rmSync(dir, { recursive: true, force: true }); });

describe("permissions store durability", () => {
  it("persists a matrix edit across a process restart", async () => {
    const s1 = await import("./store");
    s1.setPermission("Sales", "money", "edit"); // default is "view"
    expect(s1.getMatrix().Sales?.money).toBe("edit");

    freshCache(); // simulate restart — cache gone, must reload from disk
    const s2 = await import("./store");
    expect(s2.getMatrix().Sales?.money).toBe("edit");
  });

  it("persists a role assignment across a restart", async () => {
    const s1 = await import("./store");
    const members = Object.keys(s1.getAssignments());
    const target = members.find((m) => m !== "owner") ?? members[0];
    s1.assignRole(target, "Manager");

    freshCache();
    const s2 = await import("./store");
    expect(s2.roleForMember(target)).toBe("Manager");
  });

  it("never lets Owner be downgraded", async () => {
    const { setPermission, getMatrix } = await import("./store");
    setPermission("Owner", "admin", "none");
    expect(getMatrix().Owner.admin).toBe("edit");
  });

  it("creates and deletes custom roles (built-ins protected), durably", async () => {
    const s1 = await import("./store");
    s1.createRole("Bookkeeper");
    expect(s1.listRoles()).toContain("Bookkeeper");
    expect(() => s1.createRole("Bookkeeper")).toThrow(/already exists/i);
    expect(() => s1.deleteRole("Owner")).toThrow(/built-in/i);
    expect(() => s1.deleteRole("Sales")).toThrow(/built-in/i);

    freshCache(); // restart — custom role persisted
    const s2 = await import("./store");
    expect(s2.listRoles()).toContain("Bookkeeper");

    // a member on the custom role drops to Viewer when it's deleted
    const members = Object.keys(s2.getAssignments());
    const target = members.find((m) => m !== "owner") ?? members[0];
    s2.assignRole(target, "Bookkeeper");
    s2.deleteRole("Bookkeeper");
    expect(s2.listRoles()).not.toContain("Bookkeeper");
    expect(s2.roleForMember(target)).toBe("Viewer");
  });
});
