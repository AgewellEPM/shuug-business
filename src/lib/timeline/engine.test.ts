import { describe, it, expect } from "vitest";
import { buildTimeline, summarizeTimeline, type TimelineEvent } from "./engine";

const ev = (id: string, type: TimelineEvent["type"], atMs: number, needsAction = false): TimelineEvent =>
  ({ id, type, atMs, title: id, detail: "", needsAction });

describe("timeline", () => {
  const events = [
    ev("o1", "order", 100),
    ev("m1", "message", 300, true), // awaiting reply
    ev("q1", "quote", 200, true),   // open quote
    ev("o2", "order", 400, true),   // unpaid
    ev("m2", "message", 250, false),
  ];

  it("merges newest-first", () => {
    expect(buildTimeline(events).map((e) => e.id)).toEqual(["o2", "m1", "m2", "q1", "o1"]);
  });

  it("summarizes open items, awaiting-reply and open quotes", () => {
    const s = summarizeTimeline(events);
    expect(s.totalEvents).toBe(5);
    expect(s.openItems).toBe(3);       // m1, q1, o2
    expect(s.awaitingReply).toBe(1);   // m1
    expect(s.openQuotes).toBe(1);      // q1
    expect(s.lastContactMs).toBe(400);
  });

  it("is empty-safe", () => {
    const s = summarizeTimeline([]);
    expect(s.totalEvents).toBe(0);
    expect(s.lastContactMs).toBeNull();
  });
});
