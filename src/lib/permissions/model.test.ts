import { describe, it, expect } from "vitest";
import { can, allowedSections, sectionForPath, DEFAULT_MATRIX } from "./model";

describe("sectionForPath", () => {
  it("maps routes to their section by longest prefix", () => {
    expect(sectionForPath("/orders")).toBe("sales");
    expect(sectionForPath("/customers/joes-market")).toBe("sales");
    expect(sectionForPath("/distribution?tab=routes")).toBe("distribution");
    expect(sectionForPath("/analytics")).toBe("money");
    expect(sectionForPath("/admin")).toBe("admin");
    expect(sectionForPath("/")).toBe("home");
    expect(sectionForPath("/today")).toBe("home");
  });
});

describe("can (default matrix)", () => {
  it("Owner can edit everything incl. admin", () => {
    expect(can(DEFAULT_MATRIX, "Owner", "admin", "edit")).toBe(true);
    expect(can(DEFAULT_MATRIX, "Owner", "money", "edit")).toBe(true);
  });
  it("Sales can edit sales but only view money and cannot see admin", () => {
    expect(can(DEFAULT_MATRIX, "Sales", "sales", "edit")).toBe(true);
    expect(can(DEFAULT_MATRIX, "Sales", "money", "view")).toBe(true);
    expect(can(DEFAULT_MATRIX, "Sales", "money", "edit")).toBe(false);
    expect(can(DEFAULT_MATRIX, "Sales", "admin", "view")).toBe(false);
  });
  it("Warehouse edits operations, not marketing/money", () => {
    expect(can(DEFAULT_MATRIX, "Warehouse", "operations", "edit")).toBe(true);
    expect(can(DEFAULT_MATRIX, "Warehouse", "marketing", "view")).toBe(false);
    expect(can(DEFAULT_MATRIX, "Warehouse", "money", "view")).toBe(false);
  });
  it("unknown role has no access", () => {
    expect(can(DEFAULT_MATRIX, "Ghost", "sales", "view")).toBe(false);
  });
});

describe("allowedSections", () => {
  it("always includes home and excludes none-level sections", () => {
    const sales = allowedSections(DEFAULT_MATRIX, "Sales");
    expect(sales).toContain("home");
    expect(sales).toContain("sales");
    expect(sales).not.toContain("admin");
    expect(allowedSections(DEFAULT_MATRIX, "Warehouse")).not.toContain("money");
  });
});
