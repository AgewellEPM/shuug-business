// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync } from "node:fs";
import { QBD_CHAPTERS, QBD_REQUIREMENTS, QBD_MANUAL_URL, manualCoverage } from "./manual";
it("tracks all twenty manual chapters, including templates, returned payments and payroll processing", () => {
  expect(QBD_CHAPTERS.map(c => c[0])).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  for (const c of QBD_CHAPTERS) expect(QBD_REQUIREMENTS.some(r => r.chapter === c[0]), `Chapter ${c[0]}`).toBe(true);
  expect(QBD_REQUIREMENTS.find(r => r.id === "form-layout")?.chapter).toBe(7);
  expect(QBD_REQUIREMENTS.filter(r => r.chapter === 12).map(r => r.title).join(" ")).toMatch(/payment|deposit/i);
  expect(QBD_REQUIREMENTS.filter(r => r.chapter === 15).map(r => r.acceptance).join(" ")).toMatch(/941/);
});
it("provides distinct requirements, bounded PDF references and real implementation evidence paths", () => {
  expect(new Set(QBD_REQUIREMENTS.map(r => r.id)).size).toBe(QBD_REQUIREMENTS.length);
  expect(QBD_MANUAL_URL).toMatch(/^https:\/\/quickbooks.intuit.com\//);
  for (const r of QBD_REQUIREMENTS) {
    expect(r.pdfPage).toBeGreaterThan(0); expect(r.pdfPage).toBeLessThanOrEqual(210); expect(r.acceptance.length).toBeGreaterThan(30);
    for (const evidence of r.evidence) expect(existsSync(evidence), `${r.id}: ${evidence}`).toBe(true);
    if (r.status === "verified") { expect(r.evidence.length).toBeGreaterThan(0); expect(r.remaining).toBe(""); }
  }
});
it("does not treat partial implementations, unrelated extensions or unevaluated requirements as completed parity", () => {
  const c = manualCoverage(); expect(c.total).toBe(c.verified + c.partial + c.missing + c.unverified);
  expect(QBD_REQUIREMENTS.find(r => r.id === "cash-accrual")?.status).toBe("missing");
  expect(QBD_REQUIREMENTS.find(r => r.id === "journal-post")?.status).toBe("partial");
  expect(QBD_REQUIREMENTS.some(r => /AI handler|childcare|VIN decoder/i.test(r.title))).toBe(false);
});
