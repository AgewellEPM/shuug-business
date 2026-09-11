import { describe, it, expect } from "vitest";
import { ageGroupFor, ageYears, requiredStaff, ratioStatus, attendanceHours, presentRecords, DEFAULT_RATIOS, type AttendanceRecord } from "./model";

describe("age groups", () => {
  it("classifies by age on the reference date", () => {
    expect(ageGroupFor("2024-01-01", "2024-06-01")).toBe("infant");   // <1
    expect(ageGroupFor("2022-01-01", "2024-06-01")).toBe("toddler");  // 2
    expect(ageGroupFor("2020-01-01", "2024-06-01")).toBe("preschool");// 4
    expect(ageGroupFor("2016-01-01", "2024-06-01")).toBe("school-age"); // 8
  });
  it("computes whole years, not counting an unreached birthday", () => {
    expect(ageYears("2020-07-01", "2024-06-01")).toBe(3); // birthday not yet reached
    expect(ageYears("2020-05-01", "2024-06-01")).toBe(4);
  });
});

describe("staff ratios (the safety-critical piece)", () => {
  it("required staff = ceil per group, summed", () => {
    // 8 infants (1:4 → 2) + 7 toddlers (1:6 → 2) = 4 staff
    expect(requiredStaff({ infant: 8, toddler: 7 })).toBe(4);
  });
  it("ratioStatus flags non-compliance and the shortfall", () => {
    const s = ratioStatus({ infant: 8, toddler: 7 }, 3); // needs 4, has 3
    expect(s.requiredStaff).toBe(4);
    expect(s.childrenPresent).toBe(15);
    expect(s.compliant).toBe(false);
    expect(s.shortfall).toBe(1);
  });
  it("is compliant when staff meets or beats the requirement", () => {
    expect(ratioStatus({ preschool: 10 }, 1).compliant).toBe(true);   // 1:10 exactly
    expect(ratioStatus({ preschool: 11 }, 1).compliant).toBe(false);  // needs 2
  });
  it("uses the default licensing ratios", () => {
    expect(DEFAULT_RATIOS.infant).toBe(4);
    expect(DEFAULT_RATIOS["school-age"]).toBe(15);
  });
});

describe("attendance", () => {
  const rec = (over: Partial<AttendanceRecord>): AttendanceRecord => ({ id: "a", studentId: "s", dateISO: "2024-06-01", checkInMs: 1000, checkOutMs: null, checkedInBy: "Mom", checkedOutBy: "", ...over });
  it("hours count up to now for an open check-in", () => {
    expect(attendanceHours(rec({ checkInMs: 0, checkOutMs: null }), 3_600_000)).toBe(1);
    expect(attendanceHours(rec({ checkInMs: 0, checkOutMs: 7_200_000 }), 9_999_999)).toBe(2);
  });
  it("presentRecords returns only still-checked-in kids for the date", () => {
    const recs = [rec({ id: "1", checkOutMs: null }), rec({ id: "2", checkOutMs: 5000 }), rec({ id: "3", dateISO: "2024-06-02", checkOutMs: null })];
    const present = presentRecords(recs, "2024-06-01");
    expect(present.map((r) => r.id)).toEqual(["1"]);
  });
});
