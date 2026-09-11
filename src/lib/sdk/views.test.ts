import { describe, it, expect } from "vitest";
import { availableViews, groupByChoice, groupByMonth, monthLabel } from "./views";
import type { Field } from "../features/model";
import type { ModuleRecord } from "./types";

const F = (over: Partial<Field>): Field => ({ id: "x", label: "X", type: "text", required: false, options: [], ...over });
const rec = (values: Record<string, unknown>): ModuleRecord => ({ id: Math.random().toString(36).slice(2), values: values as never, archived: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });

describe("availableViews", () => {
  it("always offers table; board only with a select; calendar only with a date", () => {
    expect(availableViews([F({ id: "a" })])).toEqual(["table"]);
    expect(availableViews([F({ id: "s", type: "select", options: ["A", "B"] })])).toEqual(["table", "board"]);
    expect(availableViews([F({ id: "d", type: "date" })])).toEqual(["table", "calendar"]);
    expect(availableViews([F({ id: "s", type: "select", options: ["A", "B"] }), F({ id: "d", type: "date" })])).toEqual(["table", "board", "calendar"]);
  });
});

describe("groupByChoice (board)", () => {
  const field = F({ id: "status", type: "select", options: ["New", "Done"] });
  it("groups records into columns in option order, plus a no-status bucket when needed", () => {
    const groups = groupByChoice([rec({ status: "Done" }), rec({ status: "New" }), rec({ status: "New" }), rec({})], field);
    expect(groups.map((g) => g.label)).toEqual(["New", "Done", "No status"]);
    expect(groups[0].records).toHaveLength(2);
    expect(groups[2].records).toHaveLength(1); // the record with no status
  });
  it("omits the empty no-status bucket when every record has a value", () => {
    const groups = groupByChoice([rec({ status: "New" })], field);
    expect(groups.some((g) => g.key === "")).toBe(false);
  });
});

describe("groupByMonth (calendar)", () => {
  const field = F({ id: "due", type: "date" });
  it("buckets by YYYY-MM, newest month first, undated last", () => {
    const groups = groupByMonth([rec({ due: "2026-03-10" }), rec({ due: "2026-01-05" }), rec({ due: "" })], field);
    expect(groups.map((g) => g.key)).toEqual(["2026-03", "2026-01", "undated"]);
    expect(groups[0].label).toBe("Mar 2026");
  });
});

describe("monthLabel", () => {
  it("formats a YYYY-MM into a readable month", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
  });
});
