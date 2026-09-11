import { describe, it, expect, afterEach, vi } from "vitest";
import { INTEGRATIONS, CATEGORY_ORDER, hubConfigured, integrationById } from "./registry";
import { getGodaddyConfig, godaddyStatus } from "./godaddy";

afterEach(() => vi.unstubAllEnvs());

describe("integration registry", () => {
  it("covers the providers a small business expects, with unique ids", () => {
    const ids = INTEGRATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const must of ["shopify", "amazon", "godaddy", "zapier", "slack"]) expect(ids).toContain(must);
  });

  it("every category used is in CATEGORY_ORDER (so nothing is dropped from the hub)", () => {
    for (const spec of INTEGRATIONS) expect(CATEGORY_ORDER).toContain(spec.category);
  });

  it("settings-managed specs carry a connectionId; hub-managed carry keys", () => {
    for (const spec of INTEGRATIONS) {
      if (spec.managedBy === "settings") expect(spec.connectionId).toBeTruthy();
      else expect((spec.keys ?? []).length).toBeGreaterThan(0);
    }
  });

  it("hubConfigured is fail-closed: false until every key is present", () => {
    const godaddy = integrationById("godaddy")!;
    expect(hubConfigured(godaddy)).toBe(false);
    vi.stubEnv("GODADDY_API_KEY", "k");
    expect(hubConfigured(godaddy)).toBe(false); // secret still missing
    vi.stubEnv("GODADDY_API_SECRET", "s");
    expect(hubConfigured(godaddy)).toBe(true);
  });
});

describe("GoDaddy connector", () => {
  it("is not configured without both key and secret (fail-closed)", () => {
    expect(getGodaddyConfig()).toBeNull();
    expect(godaddyStatus().configured).toBe(false);
    vi.stubEnv("GODADDY_API_KEY", "k");
    vi.stubEnv("GODADDY_API_SECRET", "s");
    const cfg = getGodaddyConfig();
    expect(cfg?.base).toBe("https://api.godaddy.com");
    expect(godaddyStatus().configured).toBe(true);
  });

  it("uses the OTE host when GODADDY_ENVIRONMENT=ote", () => {
    vi.stubEnv("GODADDY_API_KEY", "k");
    vi.stubEnv("GODADDY_API_SECRET", "s");
    vi.stubEnv("GODADDY_ENVIRONMENT", "ote");
    expect(getGodaddyConfig()?.base).toBe("https://api.ote-godaddy.com");
  });
});
