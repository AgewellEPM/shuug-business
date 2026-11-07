import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attestFinancialFacts, peelCoachAvailable, type PeelFinancialInput } from "./peel";

const input = (): PeelFinancialInput => ({ rows: [
  { id: "synthetic-1", grossCents: 2_000, feesCents: 300, vehicleCents: 500, netCents: 1_200 },
], unpricedCount: 2 });
const toolNames = ["derive_numeric_property_row_count", ...["grossCents", "feesCents", "vehicleCents", "netCents"].map(key => `derive_numeric_property_gig_tax_${key}`)];
const reply = (body: string) => ({ version: 1, engine: "Peel symbolic-floor", verified: true,
  requestDigest: createHash("sha256").update(body).digest("hex"), sourceDigest: "a".repeat(64), modelCalls: 0,
  coverage: { pricedCount: 1, unpricedCount: 2 }, tools: toolNames,
  totals: { pricedCount: 1, grossCents: 2_000, feesCents: 300, vehicleCents: 500, netCents: 1_200 } });

describe("private Peel numeric transport", () => {
  beforeEach(() => {
    vi.stubEnv("GIG_TAX_PEEL_URL", "http://127.0.0.1:18943/v1/financial-attestation");
    vi.stubEnv("GIG_TAX_PEEL_TOKEN", "synthetic-transport-token-never-used-outside-tests");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("defaults unavailable and refuses nonlocal or redirected configuration", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GIG_TAX_PEEL_URL", "");
    expect(peelCoachAvailable()).toBe(false);
    expect((await attestFinancialFacts(input())).reason).toBe("not-configured");
    for (const url of ["https://example.com/v1/financial-attestation", "http://localhost:18943/v1/financial-attestation", "http://127.0.0.1:18943/v1/financial-attestation?target=elsewhere"]) {
      vi.stubEnv("GIG_TAX_PEEL_URL", url); expect(peelCoachAvailable()).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never sends malformed, duplicated, inconsistent or extra record data", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const bad: unknown[] = [
      { ...input(), rows: [{ ...input().rows[0], grossCents: NaN }] },
      { ...input(), rows: [input().rows[0], input().rows[0]] },
      { ...input(), rows: [{ ...input().rows[0], netCents: 1 }] },
      { ...input(), rows: [{ id: "missing-column", grossCents: 1 }] },
      { ...input(), rows: [{ ...input().rows[0], taxDocument: "private text" }] },
      { ...input(), rows: Array.from({ length: 5_001 }, (_, i) => ({ ...input().rows[0], id: `row-${i}` })) },
    ];
    for (const value of bad) expect((await attestFinancialFacts(value as PeelFinancialInput)).reason).toBe("invalid-numeric-projection");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds a valid attestation to the exact safe projection and coverage", async () => {
    const fetcher = vi.fn(async (_url, options: RequestInit) => {
      expect(options.redirect).toBe("error");
      expect(options.headers).toMatchObject({ Authorization: "Bearer synthetic-transport-token-never-used-outside-tests" });
      const body = String(options.body);
      expect(JSON.parse(body)).toEqual({ version: 1, ...input() });
      return Response.json(reply(body));
    }); vi.stubGlobal("fetch", fetcher);
    const result = await attestFinancialFacts(input());
    expect(result).toMatchObject({ available: true, verified: true, coverage: { pricedCount: 1, unpricedCount: 2 },
      totals: { pricedCount: 1, netCents: 1_200 }, modelCalls: 0 });
    expect(result.tools).toEqual(toolNames);
  });

  it("refuses stale, incomplete, oversized and unrelated worker replies", async () => {
    for (const mutate of [
      (r: ReturnType<typeof reply>) => ({ ...r, requestDigest: "b".repeat(64) }),
      (r: ReturnType<typeof reply>) => ({ ...r, coverage: { pricedCount: 1, unpricedCount: 0 } }),
      (r: ReturnType<typeof reply>) => ({ ...r, totals: { ...r.totals, netCents: 1.5 } }),
      (r: ReturnType<typeof reply>) => ({ ...r, tools: ["invented_tool"] }),
      (r: ReturnType<typeof reply>) => ({ ...r, padding: "x".repeat(33_000) }),
    ]) {
      vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => Response.json(mutate(reply(String(options.body)))));
      expect((await attestFinancialFacts(input())).verified).toBe(false);
    }
  });

  it("keeps an empty projection unknown and preserves the unpriced count", async () => {
    vi.stubGlobal("fetch", async (_url: unknown, options: RequestInit) => Response.json({
      ...reply(String(options.body)), verified: false, tools: [], totals: undefined,
      coverage: { pricedCount: 0, unpricedCount: 8 },
    }));
    const result = await attestFinancialFacts({ rows: [], unpricedCount: 8 });
    expect(result).toMatchObject({ available: true, verified: false, reason: "no-priced-records", coverage: { pricedCount: 0, unpricedCount: 8 } });
    expect(result.totals).toBeUndefined();
  });

  it("does not turn authentication failure or transport errors into verification", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Authentication required." }, { status: 401 }));
    expect((await attestFinancialFacts(input())).verified).toBe(false);
    vi.stubGlobal("fetch", async () => { throw new Error("connection unavailable"); });
    expect((await attestFinancialFacts(input())).available).toBe(false);
  });
});
