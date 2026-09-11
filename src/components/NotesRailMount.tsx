/**
 * NotesRailMount — drop-in wrapper for the app shell. Wires the team roster and
 * the note server actions into the slide-out NotesRail. Mount once (e.g. in
 * WorkspaceShell) with no props: <NotesRailMount />.
 */
import { NotesRail } from "./NotesRail";
import { requireIdentity } from "@/lib/auth/identity";
import { addNoteAction, pageNotesAction } from "@/app/notes/actions";

export async function NotesRailMount() {
  return <NotesRail authors={[(await requireIdentity()).name]} addNoteAction={addNoteAction} pageNotesAction={pageNotesAction} />;
}
