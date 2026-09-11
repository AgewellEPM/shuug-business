"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addNote, updateNote, noteInputSchema, type Note, type NewNote } from "@/lib/notes/store";
import { readableNotes } from "@/lib/notes/access";
import { requireIdentity } from "@/lib/auth/identity";
import { requireSectionAccess, requirePathAccess } from "@/lib/permissions/guard";
export interface NoteResult { ok: boolean; note?: Note; error?: string }
export async function addNoteAction(input: NewNote, previous?: { id: string; revision: number }): Promise<NoteResult> {
  try {
    const user = await requireIdentity();
    const parsed = noteInputSchema.parse({ ...input, author: user.name, ownerId: user.id, visibility: input.visibility ?? "private" });
    if (parsed.visibility === "team") await requireSectionAccess("team", "edit");
    if (parsed.scope === "page") await requirePathAccess(parsed.pageKey, "view");
    if (previous) {
      z.object({ id: z.string().max(100), revision: z.number().int().positive() }).strict().parse(previous);
      if (!(await readableNotes()).some(n => n.id === previous.id && (n.ownerId === user.id || (!n.ownerId && user.isOwner)))) throw new Error("Note unavailable.");
    }
    const note = previous ? updateNote(previous.id, previous.revision, parsed) : addNote(parsed);
    revalidatePath("/notes"); revalidatePath("/copilot"); return { ok: true, note };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not save note." }; }
}
export async function pageNotesAction(pageKey: string): Promise<Note[]> { return (await readableNotes()).filter(n => n.pageKey === pageKey); }
