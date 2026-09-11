import { describe,it,expect } from "vitest";
import { importAuctionCsv,importSpendCsv,parseCsv } from "./imports";
import { modeledSpend } from "./research";
describe("competitive evidence imports",()=>{
  it("accepts Google report preambles, BOM, quoted fields and bounded percentages",()=>{const rows=importAuctionCsv('\uFEFFAuction insights report\nAugust 2026\nDisplay URL domain,Impression share,Overlap rate\nYou,40%,--\n"competitor.com",<10%,24.5%\n',"Aug 1–31, 2026","US");expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({domain:"competitor.com",impressionShare:"<10%",overlapRate:"24.5%",market:"US"});});
  it("rejects duplicate segmented auction rows, malformed values and invalid domains",()=>{expect(()=>importAuctionCsv('Domain,Impression share\na.com,20%\na.com,30%',"August","US")).toThrow("Duplicate");expect(()=>importAuctionCsv('Domain,Impression share\na.com,120%',"August","US")).toThrow("Invalid percentage");expect(()=>importSpendCsv('domain,estimated_monthly_spend_usd,source,period,market\nlocalhost,500,Semrush,2026-08,US')).toThrow();});
  it("preserves unknowns and makes imported spending explicitly estimated",()=>{const rows=importSpendCsv('domain,estimated_monthly_spend_usd,source,period,market\ncompetitor.com,"$1,234.56",SpyFu,2026-08,US');expect(rows[0]).toMatchObject({amountCents:123456,source:"SpyFu",basis:"third_party_estimate",period:"2026-08"});expect(()=>importSpendCsv('domain,estimated_monthly_spend_usd,source,period,market\na.com,,SpyFu,2026-08,US')).toThrow();});
  it("does not turn scenario inputs into claims about rivals",()=>{expect(modeledSpend(1000,200,.25,.05)).toBe(2500);expect(modeledSpend(1000,200,2,.05)).toBeNull();});
  it("parses embedded newlines without corrupting quoted CSV cells",()=>{expect(parseCsv('a,b\n"line one\nline two","a""b"')).toEqual([["a","b"],["line one\nline two",'a"b']]);expect(()=>parseCsv('a,"unfinished')).toThrow();});
});
