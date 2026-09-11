import { describe, it, expect } from "vitest";
import { expiryStatus, daysUntil, summarizeVault, type DocRecord } from "./model";

const TODAY = "2026-09-11";
const doc = (over: Partial<DocRecord>): DocRecord => ({
  id: "d", name: "Doc", category: "license", issuer: "", fileDataUrl: null, fileName: "", expiresAt: null,
  signature: "none", signatureProvider: null, linkedType: null, linkedId: null, notes: "", createdAt: "", ...over,
});

describe("expiryStatus", () => {
  it("classifies by expiration date", () => {
    expect(expiryStatus(null, TODAY)).toBe("no-expiry");
    expect(expiryStatus("2026-09-09", TODAY)).toBe("expired");
    expect(expiryStatus("2026-09-25", TODAY)).toBe("expiring"); // within 30d
    expect(expiryStatus("2026-12-01", TODAY)).toBe("active");
    expect(expiryStatus("2026-10-11", TODAY)).toBe("expiring"); // exactly 30d
  });
});

describe("daysUntil", () => {
  it("counts days to expiry", () => {
    expect(daysUntil("2026-09-21", TODAY)).toBe(10);
    expect(daysUntil("2026-09-01", TODAY)).toBe(-10);
  });
});

describe("summarizeVault", () => {
  it("counts expiring, expired, and awaiting signature", () => {
    const s = summarizeVault([
      doc({ expiresAt: "2026-09-20" }),  // expiring
      doc({ expiresAt: "2026-08-01" }),  // expired
      doc({ expiresAt: null, signature: "sent" }), // awaiting
      doc({ expiresAt: "2027-01-01" }),  // active
    ], TODAY);
    expect(s.total).toBe(4);
    expect(s.expiring).toBe(1);
    expect(s.expired).toBe(1);
    expect(s.awaitingSignature).toBe(1);
  });
});
