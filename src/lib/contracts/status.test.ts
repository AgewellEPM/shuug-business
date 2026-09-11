import { describe, it, expect } from "vitest";
import { contractStatus, daysUntil } from "./status";

describe("contractStatus", () => {
  const today = "2026-09-10";
  it("is expired once the date has passed", () => {
    expect(contractStatus("2026-09-09", today)).toBe("expired");
  });
  it("is expiring inside the 30-day warning window", () => {
    expect(contractStatus("2026-09-25", today)).toBe("expiring");
    expect(contractStatus("2026-10-10", today)).toBe("expiring"); // exactly 30 days
  });
  it("is active well beyond the window", () => {
    expect(contractStatus("2026-12-01", today)).toBe("active");
  });
});

describe("daysUntil", () => {
  it("is positive in the future, negative in the past", () => {
    expect(daysUntil("2026-09-20", "2026-09-10")).toBe(10);
    expect(daysUntil("2026-09-05", "2026-09-10")).toBe(-5);
  });
});
