import { describe, it, expect } from "vitest";
import { defaultBoard, normalizeBoard, availableToAdd, moveWidget, WIDGET_IDS, DEFAULT_BOARDS } from "./registry";

describe("cockpit registry", () => {
  it("every default board references only real widgets", () => {
    for (const [role, board] of Object.entries(DEFAULT_BOARDS)) {
      for (const id of board) expect(WIDGET_IDS, `${role} → ${id}`).toContain(id);
    }
  });

  it("defaultBoard falls back to Owner for an unknown role", () => {
    expect(defaultBoard("Ghost")).toEqual(DEFAULT_BOARDS.Owner);
    expect(defaultBoard("Sales")).toEqual(DEFAULT_BOARDS.Sales);
  });

  it("normalizeBoard drops unknown ids and dedupes, keeping order", () => {
    expect(normalizeBoard(["kpis", "bogus", "kpis", "channels"])).toEqual(["kpis", "channels"]);
  });

  it("availableToAdd returns exactly the unpinned widgets", () => {
    const board = ["kpis", "channels"];
    const add = availableToAdd(board).map((w) => w.id);
    expect(add).not.toContain("kpis");
    expect(add).toContain("recent-orders");
    expect(add.length).toBe(WIDGET_IDS.length - 2);
  });

  it("moveWidget reorders immutably", () => {
    const board = ["a", "b", "c"];
    expect(moveWidget(board, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveWidget(board, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveWidget(board, 1, 1)).toBe(board); // no-op returns same ref
    expect(board).toEqual(["a", "b", "c"]); // original untouched
  });
});
