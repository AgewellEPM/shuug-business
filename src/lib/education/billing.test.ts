import { describe, it, expect } from "vitest";
import { buildTuitionRun, tuitionRunTotalCents, isBillingMonth } from "./billing";
import type { Student, EdClass, Enrollment } from "./store";

const student = (id: string, name: string): Student => ({ id, name, dobISO: "2021-01-01", guardians: [], authorizedPickups: [], notes: "", createdAt: "" });
const cls = (id: string, name: string, priceCents: number): EdClass => ({ id, name, kind: "daycare", ageGroup: null, capacity: 20, schedule: "", level: "", priceCents });
const enr = (studentId: string, classId: string): Enrollment => ({ id: `${studentId}-${classId}`, studentId, classId, createdAt: "" });

describe("buildTuitionRun", () => {
  const students = [student("a", "Ava"), student("b", "Ben")];
  const classes = [cls("room", "Toddler Room", 90000), cls("swim", "Swim L1", 12000), cls("free", "Open Play", 0)];

  it("sums each enrolled student's classes into a monthly tuition draft", () => {
    const drafts = buildTuitionRun(students, classes, [enr("a", "room"), enr("a", "swim"), enr("b", "room")]);
    const ava = drafts.find((d) => d.studentId === "a")!;
    expect(ava.totalCents).toBe(102000); // 90000 + 12000
    expect(ava.lines).toHaveLength(2);
    expect(drafts.find((d) => d.studentId === "b")!.totalCents).toBe(90000);
  });

  it("ignores $0 classes and students with no paid enrollment", () => {
    const drafts = buildTuitionRun(students, classes, [enr("a", "free")]);
    expect(drafts).toHaveLength(0); // only free class → no invoice
  });

  it("sorts by student name and totals the run", () => {
    const drafts = buildTuitionRun(students, classes, [enr("b", "room"), enr("a", "swim")]);
    expect(drafts.map((d) => d.studentName)).toEqual(["Ava", "Ben"]);
    expect(tuitionRunTotalCents(drafts)).toBe(12000 + 90000);
  });
});

describe("isBillingMonth", () => {
  it("accepts YYYY-MM and rejects junk", () => {
    expect(isBillingMonth("2026-09")).toBe(true);
    expect(isBillingMonth("2026-13")).toBe(false);
    expect(isBillingMonth("2026-9")).toBe(false);
    expect(isBillingMonth("sept")).toBe(false);
  });
});
