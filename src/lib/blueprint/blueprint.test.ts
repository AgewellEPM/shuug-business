import { describe, it, expect } from "vitest";
import { blueprintFromSetup } from "./load";

describe("blueprintFromSetup — how the platform molds", () => {
  it("is unconfigured when no industry is set", () => {
    const b = blueprintFromSetup(null);
    expect(b.configured).toBe(false);
    expect(b.industryLabel).toBeNull();
    expect(b.packs).toHaveLength(0);
  });

  it("resolves the industry label and the enabled packs into real modules", () => {
    const b = blueprintFromSetup({ industryId: "home-daycare", packs: ["childcare", "accounting"] }, 2);
    expect(b.configured).toBe(true);
    expect(b.industryLabel).toBe("Home daycare");
    expect(b.packs.map((p) => p.id).sort()).toEqual(["accounting", "childcare"]);
    // the childcare pack lights up the /childcare + assessments modules
    const childcarePack = b.packs.find((p) => p.id === "childcare")!;
    expect(childcarePack.tools.some((t) => t.id === "childcare")).toBe(true);
    expect(b.moduleCount).toBeGreaterThan(0);
    expect(b.handlerCount).toBe(2);
  });

  it("counts distinct modules across packs (no double counting shared tools)", () => {
    const b = blueprintFromSetup({ industryId: "restaurant", packs: ["restaurant", "accounting"] });
    const allToolIds = b.packs.flatMap((p) => p.tools.map((t) => t.id));
    expect(b.moduleCount).toBe(new Set(allToolIds).size);
  });

  it("always reports the live capability count from the state layer", () => {
    expect(blueprintFromSetup(null).liveCapabilities).toBeGreaterThan(0);
  });
});
