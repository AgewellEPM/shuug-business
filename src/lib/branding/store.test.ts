import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { readableOn } from "./store";

let dir = "";
function freshCache() { (globalThis as unknown as { __branding?: unknown }).__branding = undefined; }
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "dd-brand-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); freshCache(); });
afterEach(() => { vi.unstubAllEnvs(); freshCache(); rmSync(dir, { recursive: true, force: true }); });

describe("branding store", () => {
  it("defaults, then persists a saved brand across a restart", async () => {
    const s1 = await import("./store");
    expect(s1.getBranding().businessName).toBe("Shuug");
    s1.saveBranding({ businessName: "Ghost Pepper Co", primaryColor: "#7c3aed", hiddenSections: ["Marketing"] });

    freshCache();
    const s2 = await import("./store");
    const b = s2.getBranding();
    expect(b.businessName).toBe("Ghost Pepper Co");
    expect(b.primaryColor).toBe("#7c3aed");
    expect(b.hiddenSections).toEqual(["Marketing"]);
  });

  it("rejects a bad color instead of crashing", async () => {
    const s = await import("./store");
    const before = s.getBranding().primaryColor;
    const b = s.saveBranding({ primaryColor: "not-a-color" });
    expect(b.primaryColor).toBe(before);
  });

  it("picks readable text for a background", () => {
    expect(readableOn("#ffffff")).toBe("#0f172a"); // dark text on light
    expect(readableOn("#000000")).toBe("#ffffff"); // light text on dark
  });
  it("migrates an existing brand and persists mixed profiles and individual switches", async () => {
    writeFileSync(path.join(dir, "branding.json"), JSON.stringify({ businessName: "Community Works", hiddenSections: ["Marketing"], logoText: "CW", accentColor: "#123456" }));
    const s = await import("./store");
    expect(s.getBranding().organizationTypes).toEqual(["product"]);
    s.saveBranding({ organizationTypes: ["product", "nonprofit", "service"], serviceTypes: ["field", "appointment"], featureVisibility: { "sales-tax": false, "nonprofit-donors": true } });
    expect(s.getBranding()).toMatchObject({ businessName: "Community Works", logoText: "CW", hiddenSections: ["Marketing"], featureVisibility: { "sales-tax": false } });
    const saved = JSON.parse(readFileSync(path.join(dir, "branding.json"), "utf8"));
    saved.featureVisibility["sales-tax"] = true;
    writeFileSync(path.join(dir, "branding.json"), JSON.stringify(saved));
    expect(s.getBranding().featureVisibility["sales-tax"]).toBe(true);
  });
  it("rejects malformed switches without overwriting existing settings", async () => {
    const s = await import("./store");
    s.saveBranding({ businessName: "Keep me" });
    expect(() => s.saveBranding({ organizationTypes: [] })).toThrow();
    expect(() => s.saveBranding({ featureVisibility: { "sales-tax": "off" } } as never)).toThrow();
    expect(s.getBranding().businessName).toBe("Keep me");
  });
});
