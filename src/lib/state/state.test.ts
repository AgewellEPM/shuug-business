import { describe, it, expect } from "vitest";
import { PRIMITIVES, VERTICAL_MAP, verticalMapping, primitivesUsed, type PrimitiveKind } from "./primitives";
import { CAPABILITIES, capabilityById, capabilitySurface, liveCapabilities } from "./capabilities";
import { canCall, usableCapabilities } from "./facade";
import { DEFAULT_MATRIX } from "../permissions/model";

describe("primitives", () => {
  it("defines the ten recurring primitives", () => {
    expect(PRIMITIVES).toHaveLength(10);
    const kinds = PRIMITIVES.map((p) => p.kind);
    for (const k of ["entity", "agreement", "resource", "work", "transaction", "payment", "ledger-event", "communication", "state-change"] as PrimitiveKind[]) expect(kinds).toContain(k);
  });

  it("maps different verticals' nouns onto shared primitives (the thesis)", () => {
    // A restaurant 'guest' and a swim school 'parent' are both the customer entity.
    expect(verticalMapping("restaurant")!.nouns.find((n) => n.noun === "guest")).toMatchObject({ primitive: "entity", role: "customer" });
    expect(verticalMapping("swim-school")!.nouns.find((n) => n.noun === "parent")).toMatchObject({ primitive: "entity", role: "customer" });
    // A mechanic's 'vehicle' and a daycare 'child' are both entities (asset / participant).
    expect(verticalMapping("auto-repair")!.nouns.find((n) => n.noun === "vehicle")).toMatchObject({ primitive: "entity", role: "asset" });
  });

  it("every vertical exercises the payment + transaction primitives", () => {
    for (const v of VERTICAL_MAP) {
      const used = primitivesUsed(v.vertical);
      expect(used).toContain("transaction");
      expect(used).toContain("payment");
      expect(used).toContain("entity");
    }
  });
});

describe("capability surface", () => {
  it("exposes the headline capabilities Luke named", () => {
    for (const id of ["customer.lookup", "appointment.available", "inventory.reserve", "invoice.create", "payment.status", "employee.assign", "supplier.order", "ledger.post"]) {
      expect(capabilityById(id), id).not.toBeNull();
    }
  });

  it("marks live vs planned honestly and never leaves a live capability unbacked", () => {
    for (const c of liveCapabilities()) expect(c.backedBy, c.id).toBeTruthy();
    const planned = CAPABILITIES.filter((c) => c.status === "planned");
    for (const c of planned) expect(c.backedBy).toBeNull();
    expect(capabilitySurface().live).toBeGreaterThan(0);
  });

  it("write capabilities require the edit permission; reads require view", () => {
    const post = capabilityById("ledger.post")!;
    expect(post.mutates).toBe(true);
    expect(post.section).toBe("money");
  });
});

describe("permission-gated capability access", () => {
  it("Owner can call every live capability", () => {
    const usable = usableCapabilities("Owner", DEFAULT_MATRIX);
    for (const c of liveCapabilities()) expect(usable, c.id).toContain(c.id);
  });

  it("a Sales role cannot post to the ledger (money edit) but can look up customers", () => {
    expect(canCall(capabilityById("ledger.post")!, "Sales", DEFAULT_MATRIX)).toBe(false);
    expect(canCall(capabilityById("customer.lookup")!, "Sales", DEFAULT_MATRIX)).toBe(true);
  });

  it("planned capabilities are never callable (not live)", () => {
    expect(canCall(capabilityById("supplier.order")!, "Owner", DEFAULT_MATRIX)).toBe(false);
  });
});
