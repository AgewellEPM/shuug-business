import { requireSectionAccess } from "@/lib/permissions/guard";
import { listEmails } from "@/lib/email/store";
import { teamNames } from "@/lib/team/store";
import { llmLabel, llmConfigured } from "@/lib/llm";
import { InboxClient } from "@/components/InboxClient";
import { draftAction, aiHandleAction, routeToAction, archiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await requireSectionAccess("team");
  const emails = listEmails();
  const newCount = emails.filter((e) => e.status === "new").length;

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mail</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">AI: {llmConfigured() ? llmLabel() : "not connected"}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Incoming email, sorted by what it is and where it goes. Review AI reply drafts and assign incoming mail to the right person. Drafts are not sent automatically. {newCount} new.
        </p>
      </header>
      <InboxClient
        emails={emails}
        members={teamNames()}
        draftAction={draftAction}
        aiHandleAction={aiHandleAction}
        routeToAction={routeToAction}
        archiveAction={archiveAction}
      />
    </div>
  );
}
