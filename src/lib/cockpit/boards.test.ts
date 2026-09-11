import { describe, it, expect } from "vitest";
import {
  defaultWorkspace, normalizeWorkspace, activeBoard, setActive,
  addBoard, removeBoard, renameBoard, addWidget, removeWidget, setWidth, moveItem,
} from "./boards";

describe("cockpit workspace", () => {
  it("builds a default workspace with one board from the role default", () => {
    const ws = defaultWorkspace("Sales");
    expect(ws.boards).toHaveLength(1);
    expect(ws.activeId).toBe("default");
    expect(ws.boards[0].items.length).toBeGreaterThan(0);
    expect(ws.boards[0].items.every((i) => typeof i.id === "string" && i.w)).toBe(true);
  });

  it("adds, switches and removes dashboards (never deletes the last)", () => {
    let ws = defaultWorkspace("Owner");
    ws = addBoard(ws, "b2", "Marketing view");
    expect(ws.boards).toHaveLength(2);
    expect(ws.activeId).toBe("b2");
    ws = setActive(ws, "default");
    expect(activeBoard(ws).id).toBe("default");
    ws = removeBoard(ws, "default");
    expect(ws.boards).toHaveLength(1);
    ws = removeBoard(ws, "b2"); // last one — refused
    expect(ws.boards).toHaveLength(1);
  });

  it("renames a board", () => {
    let ws = defaultWorkspace("Owner");
    ws = renameBoard(ws, "default", "Owner HQ");
    expect(ws.boards[0].name).toBe("Owner HQ");
  });

  it("adds/removes/resizes/reorders widgets on the active board only", () => {
    let ws = addBoard(defaultWorkspace("Owner"), "empty", "Blank");
    ws = addWidget(ws, "kpis");
    ws = addWidget(ws, "kpis"); // dedup
    ws = addWidget(ws, "channels");
    expect(activeBoard(ws).items.map((i) => i.id)).toEqual(["kpis", "channels"]);
    ws = setWidth(ws, "kpis", "medium");
    expect(activeBoard(ws).items[0].w).toBe("medium");
    ws = moveItem(ws, 0, 1);
    expect(activeBoard(ws).items.map((i) => i.id)).toEqual(["channels", "kpis"]);
    ws = removeWidget(ws, "channels");
    expect(activeBoard(ws).items.map((i) => i.id)).toEqual(["kpis"]);
    // the default board is untouched
    expect(ws.boards.find((b) => b.id === "default")!.items.length).toBeGreaterThan(1);
  });

  it("normalizes junk from storage: bad ids dropped, active repaired, min one board", () => {
    const ws = normalizeWorkspace({ boards: [{ id: "x", name: "X", items: [{ id: "kpis", w: "large" }, { id: "bogus", w: "small" }, { id: "kpis", w: "small" }] }], activeId: "missing" }, "Owner");
    expect(ws.boards[0].items.map((i) => i.id)).toEqual(["kpis"]);
    expect(ws.activeId).toBe("x");
    expect(normalizeWorkspace(null, "Owner").boards).toHaveLength(1);
    expect(normalizeWorkspace({ boards: [] }, "Owner").boards).toHaveLength(1);
  });
});
