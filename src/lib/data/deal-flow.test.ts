import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { standardLadder } from "@/lib/pricing";
import { buildSeedDeals } from "./seed";
import { getDealStore } from "./store";

// The server action calls revalidatePath — stub Next's cache module so the
// action runs headless under vitest.
vi.mock("@/lib/permissions/active", () => ({ getActiveRole: async () => "Owner" }));
vi.mock("@/lib/connections/access", () => ({ requireWorkspaceAccess: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Isolate every test: a fresh data dir (createCustomer now persists to the
// archive) + a clean store singleton so no test sees another's customers.
let dataDir = "";
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "dd-dealflow-"));
  vi.stubEnv("DEALDESK_DATA_DIR", dataDir);
  (globalThis as unknown as { __dealStore?: unknown }).__dealStore = {};
});
afterEach(() => {
  vi.unstubAllEnvs();
  (globalThis as unknown as { __dealStore?: unknown }).__dealStore = {};
  rmSync(dataDir, { recursive: true, force: true });
});

describe("seed data ladder invariant (site 1: seed.ts)", () => {
  it("every seeded line's tiers equal standardLadder(base) — pins the seed site", () => {
    for (const deal of buildSeedDeals()) {
      for (const line of deal.agreement.lines) {
        expect(line.tiers).toEqual(standardLadder(line.unitPriceCents));
      }
    }
  });
});

describe("MemoryDealStore", () => {
  it("getDeal returns the seeded Joe's Market deal", async () => {
    const store = await getDealStore();
    const deal = await store.getDeal("joes-market");
    expect(deal?.customer.company).toBe("Joe's Market");
    expect(deal?.agreement.lines.find((l) => l.skuId === "shuug-amba")?.unitPriceCents).toBe(6600);
    expect(deal?.versions).toHaveLength(1);
  });

  it("getDeal returns null for unknown customer", async () => {
    const store = await getDealStore();
    expect(await store.getDeal("nope")).toBeNull();
  });

  it("saveAgreement appends a version and mutating the returned copy is isolated", async () => {
    const store = await getDealStore();
    const deal = await store.getDeal("big-y");
    if (!deal) throw new Error("expected deal");
    deal.agreement.lines[0].unitPriceCents = 3900;

    const saved = await store.saveAgreement({
      agreement: deal.agreement,
      changedBy: "tester",
      note: "test change",
    });
    expect(saved.versions).toHaveLength(2);
    expect(saved.versions[1].note).toBe("test change");

    // Mutating the returned object must not corrupt the store.
    saved.agreement.lines[0].unitPriceCents = 1;
    const reread = await store.getDeal("big-y");
    expect(reread?.agreement.lines[0].unitPriceCents).toBe(3900);
  });
});

describe("createCustomer", () => {
  it("creates a customer with a url slug and a full default item list", async () => {
    const store = await getDealStore();
    const deal = await store.createCustomer({
      company: "Corner Deli",
      buyerName: "Sam",
      buyerEmail: "sam@corner.example",
      website: "https://corner.example",
      billingAddress: "1 A St",
      shippingAddress: "1 A St",
      quickbooksCustomerId: null,
      channel: "store", accountOwner: "T", region: "TR", requiresPO: false,
    });
    expect(deal.customer.id).toBe("corner-deli");
    expect(deal.customer.website).toBe("https://corner.example");
    expect(deal.agreement.lines).toHaveLength(3); // all SKUs by default
    expect(await store.getDeal("corner-deli")).not.toBeNull();
  });

  it("honors a per-customer item list (subset) with custom prices", async () => {
    const store = await getDealStore();
    const deal = await store.createCustomer({
      company: "Spice Hut",
      buyerName: "Mia",
      buyerEmail: "mia@spice.example",
      website: null,
      billingAddress: "2 B St",
      shippingAddress: "2 B St",
      quickbooksCustomerId: null,
      channel: "store", accountOwner: "T", region: "TR", requiresPO: true,
      lines: [{ skuId: "shuug-amba", unitPriceCents: 6500 }],
    });
    expect(deal.agreement.lines).toHaveLength(1);
    expect(deal.agreement.lines[0].skuId).toBe("shuug-amba");
    expect(deal.agreement.lines[0].unitPriceCents).toBe(6500);
    expect(deal.agreement.lines[0].tiers).toEqual(standardLadder(6500));
  });

  it("gives a unique slug when the company name collides", async () => {
    const store = await getDealStore();
    const dupe = await store.createCustomer({
      company: "Joe's Market",
      buyerName: "x",
      buyerEmail: "x@x.example",
      website: null,
      billingAddress: "",
      shippingAddress: "",
      quickbooksCustomerId: null,
      channel: "store", accountOwner: "T", region: "TR", requiresPO: false,
    });
    expect(dupe.customer.id).toBe("joes-market-2");
  });
});

describe("saveAgreementAction (site 2: server action)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL; // force the in-memory store
  });

  it("regenerates tiers via standardLadder on save — pins the save site", async () => {
    const { saveAgreementAction } = await import("@/app/customers/[id]/actions");
    const res = await saveAgreementAction(
      "local-mart",
      { "shuug-amba": 6500, "shuug-zhoug": 6900, "shuug-harissa": 7100 },
      "cut amba",
    );
    expect(res.ok).toBe(true);

    const store = await getDealStore();
    const deal = await store.getDeal("local-mart");
    const line = deal?.agreement.lines.find((l) => l.skuId === "shuug-amba");
    expect(line?.unitPriceCents).toBe(6500);
    expect(line?.tiers).toEqual(standardLadder(6500));
  });

  it("rejects an unknown customer", async () => {
    const { saveAgreementAction } = await import("@/app/customers/[id]/actions");
    const res = await saveAgreementAction("ghost", { "sku-original": 4100 }, "x");
    expect(res.ok).toBe(false);
  });

  it("rejects an empty note (validation)", async () => {
    const { saveAgreementAction } = await import("@/app/customers/[id]/actions");
    const res = await saveAgreementAction(
      "joes-market",
      { "shuug-amba": 6600, "shuug-zhoug": 6600, "shuug-harissa": 6800 },
      "",
    );
    expect(res.ok).toBe(false);
  });
});
