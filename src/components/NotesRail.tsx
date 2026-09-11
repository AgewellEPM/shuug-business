"use client";

/**
 * NotesRail — a slide-out right rail for team notes. A tab on the right edge
 * opens a panel where anyone on the team can jot a note tied to the CURRENT page
 * or "internal" (general). Mount once in the app shell; it reads the route via
 * usePathname and loads that page's notes on open.
 */
import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { Note } from "@/lib/notes/store";
import type { NoteResult } from "@/app/notes/actions";

function labelForPath(path: string): string {
  if (path === "/") return "Overview";
  const seg = path.split("/").filter(Boolean);
  return seg.map((s) => s.replace(/-/g, " ")).join(" · ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Page";
}

export function NotesRail({
  authors = ["You (Owner)"],
  addNoteAction,
  pageNotesAction,
}: {
  authors?: string[];
  addNoteAction: (input: { author: string; pageKey: string; pageLabel: string; scope: "page" | "internal"; body: string }) => Promise<NoteResult>;
  pageNotesAction: (pageKey: string) => Promise<Note[]>;
}) {
  const pathname = usePathname() ?? "/";
  const pageLabel = labelForPath(pathname);

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [author, setAuthor] = useState(authors[0]);
  const [scope, setScope] = useState<"page" | "internal">("page");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => { try { setNotes(await pageNotesAction(scope === "internal" ? "internal" : pathname)); } catch { setError("Notes are unavailable for this page."); } });
  }, [open, pathname, scope, pageNotesAction]);

  function submit() {
    if (!body.trim()) return;
    const pageKey = scope === "internal" ? "internal" : pathname;
    const label = scope === "internal" ? "Internal" : pageLabel;
    startTransition(async () => {
      setError("");
      const res = await addNoteAction({ author, pageKey, pageLabel: label, scope, body });
      if (res.ok && res.note) {
        setBody("");
        setNotes((prev) => [res.note!, ...prev]);
      } else setError(res.error || "Could not save note.");
    });
  }

  return (
    <>
      {/* Edge tab */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-lg bg-slate-900 px-2 py-3 text-xs font-semibold text-white shadow-lg [writing-mode:vertical-rl]"
        aria-expanded={open}
        aria-label="Toggle notes"
      >
        Notes
      </button>

      {/* Slide-out panel */}
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Notes</p>
            <p className="text-xs text-slate-400">{scope === "internal" ? "Internal" : pageLabel}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>

        {/* Add note */}
        <div className="border-b border-slate-200 p-3">
          <div className="mb-2 flex gap-1 text-xs">
            <button type="button" onClick={() => setScope("page")} className={`rounded-full px-2.5 py-1 font-medium ${scope === "page" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>This page</button>
            <button type="button" onClick={() => setScope("internal")} className={`rounded-full px-2.5 py-1 font-medium ${scope === "internal" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>Internal</button>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Leave a note…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          <div className="mt-2 flex items-center gap-2">
            <select value={author} onChange={(e) => setAuthor(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none">
              {authors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" onClick={submit} disabled={pending || !body.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Post</button>
          </div>
        </div>

        {error && <p role="status" className="px-3 text-xs text-red-700">{error}</p>}
        {/* This page's notes */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{scope === "internal" ? "Internal notes" : "On this page"}</p>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">{pending ? "Loading…" : "No notes on this page yet."}</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-slate-800">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{n.author} · {formatDate(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
