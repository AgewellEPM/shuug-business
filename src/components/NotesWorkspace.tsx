"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Note } from "@/lib/notes/store";
import { organizationOptions, type OrganizationType } from "@/lib/navigation/catalog";
import { addNoteAction } from "@/app/notes/actions";
const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
export function NotesWorkspace({ initial, profiles, userId }: { userId?: string; initial: Note[]; profiles: OrganizationType[] }) {
  const [notes, setNotes] = useState(initial), [selected, setSelected] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(""), [body, setBody] = useState(""), [profile, setProfile] = useState<Note["profile"]>("all");
  const [message, setMessage] = useState(""), [search, setSearch] = useState(""), [pending, startTransition] = useTransition();
  function edit(note: Note | null) { setSelected(note); setTitle(note?.title ?? ""); setBody(note?.body ?? ""); setProfile(note?.profile ?? "all"); setEditing(true); }
  return <div className="max-w-5xl space-y-5"><header><p className="dd-eyebrow">Workspace</p><h1 className="mt-2 text-2xl font-bold">Notes</h1><p className="mt-2 text-sm text-slate-500">Capture what you need to do. Discuss a note with the assistant and turn it into your work roadmap.</p></header>
    <div className="flex flex-wrap gap-3"><button onClick={() => edit(null)} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">New note</button><Link href="/copilot?tab=roadmap" className="rounded-lg border px-4 py-2 text-sm font-semibold">Open my roadmap</Link><input aria-label="Search notes" placeholder="Search notes" value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"/></div>
    {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}
    {editing && <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={event => { event.preventDefault(); startTransition(async () => {
      try { const result = await addNoteAction({ author: "Workspace", title, body, profile, scope: selected?.scope ?? "internal", pageKey: selected?.pageKey ?? "internal", pageLabel: selected?.pageLabel ?? "Internal" }, selected ? { id: selected.id, revision: selected.revision } : undefined);
        if (!result.ok || !result.note) { setMessage(result.error ?? "Could not save."); return; }
        setNotes([result.note, ...notes.filter(n => n.id !== result.note!.id)]); setEditing(false); setMessage("Note saved.");
      } catch { setMessage("Connection interrupted. Check your notes before retrying."); }
    }); }}><label className="block text-sm">Title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className={input}/></label><label className="block text-sm">Workspace profile<select value={profile} onChange={e => setProfile(e.target.value as Note["profile"])} className={input}><option value="all">All enabled profiles</option>{organizationOptions.filter(p => profiles.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label className="block text-sm">Note<textarea required maxLength={12000} rows={6} value={body} onChange={e => setBody(e.target.value)} className={input}/></label><div className="flex gap-3"><button disabled={pending} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save note</button><button type="button" onClick={() => setEditing(false)} className="text-sm">Cancel</button></div></form>}
    <ul className="space-y-3">{notes.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(search.toLowerCase())).map(note => <li key={note.id} className="rounded-xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{note.title || note.pageLabel}</h2><p className="mt-1 text-xs text-slate-500">{note.profile === "all" ? "All profiles" : organizationOptions.find(p => p.id === note.profile)?.label} · {note.visibility === "team" ? "Team note" : "Private note"} · {note.author} · {new Date(note.updatedAt).toLocaleDateString()}</p></div>{(!userId || note.ownerId === userId || !note.ownerId) && <button className="text-sm text-emerald-800" onClick={() => edit(note)}>Edit</button>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{note.body}</p><Link href={`/copilot?tab=roadmap&note=${encodeURIComponent(note.id)}`} className="mt-4 inline-block rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800">Discuss with AI →</Link></li>)}</ul>
    {!notes.length && <p className="text-sm text-slate-500">Create your first note to start planning.</p>}
  </div>;
}
