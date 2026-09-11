import { requireIdentity } from "@/lib/auth/identity";
import Link from "next/link";
import { BusinessAssistant } from "@/components/BusinessAssistant";
import { RoadmapWorkspace } from "@/components/RoadmapWorkspace";
import { readableNotes } from "@/lib/notes/access";
import { planningStateAction } from "./planning-actions";
import { activeWorkspace } from "@/lib/navigation/active-profile";
import { llmLabel } from "@/lib/llm";
export const dynamic = "force-dynamic";
export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ tab?: string; note?: string }> }) {
  const params = await searchParams;
  const user = await requireIdentity();
  const roadmap = params.tab === "roadmap" || !user.isOwner;
  const state = roadmap ? await planningStateAction() : null;
  return <div><nav className="mb-5 flex gap-3 text-sm">{user.isOwner && <Link aria-current={!roadmap ? "page" : undefined} className="rounded-lg border px-4 py-2" href="/copilot">Business tools</Link>}<Link aria-current={roadmap ? "page" : undefined} className="rounded-lg border px-4 py-2" href="/copilot?tab=roadmap">My roadmap & notes</Link></nav>{state ? <RoadmapWorkspace notes={await readableNotes()} initialThreads={state.threads} initialRoadmaps={state.roadmaps} selectedNote={params.note} profiles={(await activeWorkspace()).config.organizationTypes ?? ["product"]} provider={llmLabel()}/> : <BusinessAssistant/>}</div>;
}
