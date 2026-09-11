/**
 * Cockpit workspace model — multiple named dashboards per role, each an ordered
 * list of sized widget tiles. Pure and immutable so it's trivially testable and
 * the client just persists whatever these return. Board ids are supplied by the
 * caller (crypto.randomUUID on the client) to keep this deterministic.
 */
import {
  defaultBoard, WIDGET_IDS, defaultWidth, type BoardItem, type WidgetWidth,
} from "./registry";

export interface Board { id: string; name: string; items: BoardItem[] }
export interface Workspace { boards: Board[]; activeId: string }

/** One starter dashboard built from the role's default board. */
export function defaultWorkspace(role: string): Workspace {
  const items: BoardItem[] = defaultBoard(role).map((id) => ({ id, w: defaultWidth(id) }));
  const board: Board = { id: "default", name: "My cockpit", items };
  return { boards: [board], activeId: board.id };
}

/** Repair anything loaded from storage: valid ids, ≥1 board, valid active. */
export function normalizeWorkspace(raw: unknown, role: string): Workspace {
  const fallback = defaultWorkspace(role);
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Partial<Workspace>;
  if (!Array.isArray(r.boards) || r.boards.length === 0) return fallback;

  const boards: Board[] = r.boards
    .filter((b): b is Board => !!b && typeof b.id === "string" && typeof b.name === "string" && Array.isArray(b.items))
    .map((b) => ({
      id: b.id,
      name: b.name.slice(0, 40) || "Dashboard",
      items: dedupeItems(b.items),
    }));
  if (boards.length === 0) return fallback;

  const activeId = boards.some((b) => b.id === r.activeId) ? (r.activeId as string) : boards[0].id;
  return { boards, activeId };
}

function dedupeItems(items: unknown[]): BoardItem[] {
  const seen = new Set<string>();
  const out: BoardItem[] = [];
  for (const it of items) {
    const item = it as Partial<BoardItem>;
    if (item && typeof item.id === "string" && WIDGET_IDS.includes(item.id) && !seen.has(item.id)) {
      seen.add(item.id);
      out.push({ id: item.id, w: normalizeW(item.w) });
    }
  }
  return out;
}
function normalizeW(w: unknown): WidgetWidth {
  return w === "medium" || w === "large" ? w : "small";
}

// ---- board-list ops ----
export function activeBoard(ws: Workspace): Board {
  return ws.boards.find((b) => b.id === ws.activeId) ?? ws.boards[0];
}
export function setActive(ws: Workspace, id: string): Workspace {
  return ws.boards.some((b) => b.id === id) ? { ...ws, activeId: id } : ws;
}
export function addBoard(ws: Workspace, id: string, name: string): Workspace {
  const board: Board = { id, name: name.slice(0, 40) || "New dashboard", items: [] };
  return { boards: [...ws.boards, board], activeId: id };
}
export function removeBoard(ws: Workspace, id: string): Workspace {
  if (ws.boards.length <= 1) return ws; // never delete the last dashboard
  const boards = ws.boards.filter((b) => b.id !== id);
  const activeId = ws.activeId === id ? boards[0].id : ws.activeId;
  return { boards, activeId };
}
export function renameBoard(ws: Workspace, id: string, name: string): Workspace {
  return { ...ws, boards: ws.boards.map((b) => (b.id === id ? { ...b, name: name.slice(0, 40) || b.name } : b)) };
}

// ---- active-board item ops ----
function mapActive(ws: Workspace, fn: (items: BoardItem[]) => BoardItem[]): Workspace {
  return { ...ws, boards: ws.boards.map((b) => (b.id === ws.activeId ? { ...b, items: fn(b.items) } : b)) };
}
export function addWidget(ws: Workspace, widgetId: string): Workspace {
  if (!WIDGET_IDS.includes(widgetId)) return ws;
  return mapActive(ws, (items) => (items.some((i) => i.id === widgetId) ? items : [...items, { id: widgetId, w: defaultWidth(widgetId) }]));
}
export function removeWidget(ws: Workspace, widgetId: string): Workspace {
  return mapActive(ws, (items) => items.filter((i) => i.id !== widgetId));
}
export function setWidth(ws: Workspace, widgetId: string, w: WidgetWidth): Workspace {
  return mapActive(ws, (items) => items.map((i) => (i.id === widgetId ? { ...i, w } : i)));
}
export function moveItem(ws: Workspace, from: number, to: number): Workspace {
  return mapActive(ws, (items) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    return next;
  });
}
