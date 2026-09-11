import { describe, it, expect } from "vitest";
import { defineModule } from "./module";
import { appModules, moduleById, appModuleSectionForPath } from "./registry";
import type { AppModuleManifest } from "./types";

const base: AppModuleManifest = {
  id: "test-mod", label: "Test module", description: "x", group: "Sales", section: "sales", version: "1.0.0",
  fields: [{ id: "name", label: "Name", type: "text", required: true, options: [] }],
};

describe("defineModule validation", () => {
  it("accepts a valid manifest and brands it", () => {
    const m = defineModule(base);
    expect(m.__validated).toBe(true);
    expect(m.id).toBe("test-mod");
  });

  it("rejects a bad id (not kebab-case)", () => {
    expect(() => defineModule({ ...base, id: "Bad_ID" })).toThrow(/Module id/);
  });

  it("rejects an unknown section", () => {
    expect(() => defineModule({ ...base, section: "nope" as never })).toThrow();
  });

  it("rejects duplicate field ids", () => {
    expect(() => defineModule({ ...base, fields: [
      { id: "a", label: "A", type: "text", required: false, options: [] },
      { id: "a", label: "B", type: "text", required: false, options: [] },
    ] })).toThrow(/unique/i);
  });

  it("rejects a select field with fewer than 2 options", () => {
    expect(() => defineModule({ ...base, fields: [
      { id: "s", label: "S", type: "select", required: true, options: ["only"] },
    ] })).toThrow();
  });
});

describe("registry", () => {
  it("registers the example modules with unique ids", () => {
    const mods = appModules();
    expect(mods.length).toBeGreaterThanOrEqual(2);
    expect(new Set(mods.map((m) => m.id)).size).toBe(mods.length);
  });

  it("looks a module up by id", () => {
    expect(moduleById("customer-feedback")?.label).toBe("Customer feedback");
    expect(moduleById("does-not-exist")).toBeNull();
  });

  it("resolves the section for a /m/<id> path, ignoring query strings", () => {
    expect(appModuleSectionForPath("/m/customer-feedback")).toBe("sales");
    expect(appModuleSectionForPath("/m/equipment-log?x=1")).toBe("operations");
    expect(appModuleSectionForPath("/orders")).toBeNull();
    expect(appModuleSectionForPath("/m/ghost")).toBeNull();
  });
});

describe("example module panels compute safely", () => {
  it("customer-feedback overview handles empty records", () => {
    const m = moduleById("customer-feedback")!;
    const stats = m.panels![0].compute([]);
    expect(stats.find((s) => s.label === "Total feedback")?.value).toBe("0");
  });

  it("customer-feedback flags negative feedback without follow-up", () => {
    const m = moduleById("customer-feedback")!;
    const rec = (values: Record<string, unknown>) => ({ id: "1", values: values as never, archived: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
    const stats = m.panels![0].compute([
      rec({ sentiment: "Negative", followed_up: false }),
      rec({ sentiment: "Positive", rating: 5 }),
    ]);
    expect(stats.find((s) => s.label === "Negative — no follow-up")?.value).toBe("1");
  });
});
