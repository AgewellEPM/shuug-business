import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDealStore } from "@/lib/data/store";

vi.mock("@/lib/permissions/active", () => ({ getActiveRole: async () => "Owner" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const owner=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/connections/access",()=>({requireWorkspaceAccess:owner}));
let directory:string;

describe("placeOrderAction", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL; // in-memory store
    directory=mkdtempSync(path.join(tmpdir(),"shuug-order-action-"));vi.stubEnv("DEALDESK_DATA_DIR",directory);owner.mockReset();owner.mockResolvedValue(undefined);
  });
  afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});

  it("rejects unauthenticated order writes",async()=>{owner.mockRejectedValue(new Error("Owner access required"));const {placeOrderAction}=await import("./actions");expect(await placeOrderAction("joes-market",[{skuId:"shuug-amba",cases:70}],"PO-TEST","test")).toMatchObject({ok:false,error:"Owner access required"});});

  it("places a compliant order and persists it to history", async () => {
    const { placeOrderAction } = await import("./actions");
    const before = (await (await getDealStore()).listOrders("joes-market")).length;

    const res = await placeOrderAction(
      "joes-market",
      [{ skuId: "shuug-amba", cases: 70 }],
      "PO-TEST-1",
      "vitest order",
    );
    expect(res.ok).toBe(true);
    expect(res.durable).toBe(true);
    expect(res.orderId).toBeTruthy();

    const orders = await (await getDealStore()).listOrders("joes-market");
    expect(orders.length).toBe(before + 1);
    // newest first — the order we just placed
    expect(orders[0].poNumber).toBe("PO-TEST-1");
    expect(orders[0].totalCents).toBeGreaterThan(0);
  });

  it("rejects an order that misses minimums / PO and returns violations", async () => {
    const { placeOrderAction } = await import("./actions");
    const res = await placeOrderAction(
      "joes-market",
      [{ skuId: "shuug-amba", cases: 2 }],
      null,
      "",
    );
    expect(res.ok).toBe(false);
    const codes = (res.violations ?? []).map((v) => v.code);
    expect(codes).toContain("min_cases");
    expect(codes).toContain("po_required");
  });

  it("re-prices server-side (client cannot inject a price)", async () => {
    const { placeOrderAction } = await import("./actions");
    const res = await placeOrderAction(
      "local-mart", // PO optional, min 10 cases / $2,500
      [{ skuId: "shuug-amba", cases: 80 }],
      null,
      "",
    );
    expect(res.ok).toBe(true);
    const order = await (await getDealStore()).getOrder(res.orderId!);
    // local-mart amba base 6900 -> 50+ tier = 6900-800 = 6100
    expect(order?.lines[0].unitPriceCents).toBe(6100);
    expect(order?.lines[0].isOverride).toBe(false);
    expect(order?.lines[0].lineTotalCents).toBe(6100 * 80);
  });

  it("applies a per-order override end-to-end", async () => {
    const { placeOrderAction } = await import("./actions");
    const res = await placeOrderAction(
      "local-mart",
      [{ skuId: "shuug-amba", cases: 80, overrideUnitPriceCents: 5500 }],
      null,
      "match competitor",
    );
    expect(res.ok).toBe(true);
    const order = await (await getDealStore()).getOrder(res.orderId!);
    expect(order?.lines[0].unitPriceCents).toBe(5500);
    expect(order?.lines[0].isOverride).toBe(true);
  });
});
