import { readableNotes } from "@/lib/notes/access";
import { requireIdentity } from "@/lib/auth/identity";
import { NotesWorkspace } from "@/components/NotesWorkspace";
import { activeWorkspace } from "@/lib/navigation/active-profile";
export const dynamic = "force-dynamic";
export default async function NotesPage() {
  const user = await requireIdentity();
  return <NotesWorkspace userId={user.id} initial={await readableNotes()} profiles={(await activeWorkspace()).config.organizationTypes ?? ["product"]}/>;
}
