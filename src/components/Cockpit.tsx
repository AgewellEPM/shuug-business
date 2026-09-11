"use client";

/**
 * Cockpit — the fully-customizable business dashboard. Per role you can keep
 * MULTIPLE named dashboards, and on each: pin/unpin widgets, drag to reorder,
 * and resize tiles (third / half / full, Tableau-style). Everything persists per
 * role in localStorage so each person's cockpit is their own.
 */
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { WidgetBody } from "./CockpitWidgets";
import type { CockpitData } from "@/lib/cockpit/data";
import { availableToAdd, cycleWidth, widgetById, type WidgetWidth } from "@/lib/cockpit/registry";
import {
  normalizeWorkspace, activeBoard, setActive, addBoard, removeBoard,
  renameBoard, addWidget, removeWidget, setWidth, moveItem, type Workspace,
} from "@/lib/cockpit/boards";
import { readWorkspace, writeWorkspace, subscribeWorkspace, serverSnapshot } from "@/lib/cockpit/store";

const WIDTH_CLASS: Record<WidgetWidth, string> = {
  small: "md:col-span-1 xl:col-span-2",
  medium: "md:col-span-1 xl:col-span-3",
  large: "md:col-span-2 xl:col-span-6",
};
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `b${Date.now()}${Math.round(Math.random() * 1e6)}`);

export function Cockpit({ role, data }: { role: string; data: CockpitData }) {
  // Workspace lives in the localStorage-backed external store — read reactively,
  // write via commit. No effect, no hydration mismatch.
  const ws = useSyncExternalStore(subscribeWorkspace, () => readWorkspace(role), () => serverSnapshot(role));
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const commit = useCallback((next: Workspace) => writeWorkspace(role, next), [role]);

  const board = activeBoard(ws);
  const canAdd = availableToAdd(board.items.map((i) => i.id));

  const drop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null; setDragOver(null);
    if (from !== null) commit(moveItem(ws, from, to));
  };

  return (
    <div>
      {/* Dashboard tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {ws.boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => commit(setActive(ws, b.id))}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${b.id === ws.activeId ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {b.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => commit(addBoard(ws, uuid(), `Dashboard ${ws.boards.length + 1}`))}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          + New dashboard
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{role} · {board.name}</p>
        <div className="ml-auto flex items-center gap-2">
          {editing && (
            <>
              <button type="button" onClick={() => setShowAdd((s) => !s)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">+ Add widget</button>
              <button type="button" onClick={() => commit(normalizeWorkspace(null, role))} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">Reset all</button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setEditing((e) => !e); setShowAdd(false); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${editing ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {editing ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {/* Board settings (rename / delete) while editing */}
      {editing && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <label className="text-xs font-medium text-slate-500">Dashboard name</label>
          <input
            value={board.name}
            onChange={(e) => commit(renameBoard(ws, board.id, e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={ws.boards.length <= 1}
            onClick={() => commit(removeBoard(ws, board.id))}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-30"
          >
            Delete this dashboard
          </button>
        </div>
      )}

      {/* Add-widget gallery */}
      {editing && showAdd && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-700">Pin a widget to “{board.name}”</p>
          {canAdd.length === 0 ? (
            <p className="text-xs text-slate-500">Everything’s already on this dashboard.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {canAdd.map((w) => (
                <button key={w.id} type="button" onClick={() => { commit(addWidget(ws, w.id)); setShowAdd(false); }} className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{w.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{w.blurb}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Board grid */}
      {board.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          This dashboard is empty. Hit <strong>Customize → Add widget</strong> to build it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          {board.items.map((item, i) => {
            const def = widgetById(item.id);
            if (!def) return null;
            return (
              <section
                key={item.id}
                draggable={editing}
                onDragStart={() => { dragFrom.current = i; }}
                onDragOver={(e) => { if (editing) { e.preventDefault(); setDragOver(i); } }}
                onDrop={() => drop(i)}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${WIDTH_CLASS[item.w]} ${
                  editing ? "cursor-move border-dashed border-slate-300" : "border-slate-200"
                } ${dragOver === i && editing ? "ring-2 ring-emerald-400" : ""}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  {editing && <span className="text-slate-300" aria-hidden>⠿</span>}
                  <h2 className="text-sm font-semibold text-slate-800">{def.title}</h2>
                  {editing && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => commit(setWidth(ws, item.id, cycleWidth(item.w)))}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600 hover:bg-slate-200"
                        title="Resize"
                      >
                        {item.w}
                      </button>
                      <button type="button" onClick={() => commit(removeWidget(ws, item.id))} aria-label={`Remove ${def.title}`} className="rounded-full px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
                    </div>
                  )}
                </div>
                <WidgetBody id={item.id} data={data} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
