import { z } from "zod";
import { listDocuments, saveDocument, type WorkspaceDocument } from "../workspace/documents";
export type NoteScope = "page" | "internal";
export interface Note extends WorkspaceDocument {
  ownerId?: string; visibility?: "private" | "team";
  author: string; pageKey: string; pageLabel: string; scope: NoteScope; body: string;
  title: string; profile: "all" | "product" | "service" | "nonprofit";
}
export const noteInputSchema = z.object({
  ownerId: z.string().max(100).optional(), visibility: z.enum(["private", "team"]).optional(),
  author: z.string().trim().min(1).max(100), pageKey: z.string().max(200), pageLabel: z.string().max(120),
  scope: z.enum(["page", "internal"]), body: z.string().trim().min(1).max(12000),
  title: z.string().trim().max(200).default(""), profile: z.enum(["all", "product", "service", "nonprofit"]).default("all"),
}).strict().refine(n => n.scope === "internal" ? n.pageKey === "internal" : /^\/(?!\/)[^\\]*$/.test(n.pageKey), "Select an internal note or a valid workspace page.");
export type NewNote = z.input<typeof noteInputSchema>;
export function addNote(input: NewNote): Note { return saveDocument<Note>("note", noteInputSchema.parse(input)); }
export function updateNote(id: string, revision: number, input: NewNote): Note { return saveDocument<Note>("note", noteInputSchema.parse(input), { id, revision }); }
export function listNotes(): Note[] { return listDocuments<Note>("note"); }
export function notesForPage(pageKey: string): Note[] { return listNotes().filter(n => n.pageKey === pageKey); }
export function latestNotes(n = 20): Note[] { return listNotes().slice(0, n); }
