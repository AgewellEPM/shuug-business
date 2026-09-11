import { requireSectionAccess } from "@/lib/permissions/guard";
import Link from "next/link";
import { setting } from "@/lib/connections/vault";
import { PpcPlanner } from "@/components/PpcPlanner";
import { SKUS } from "@/lib/data/seed";
import { llmConfigured } from "@/lib/llm";
import { googleAdsStatus } from "@/lib/ppc/google-ads";
export const dynamic = "force-dynamic";
export default async function AdsPage() {
  await requireSectionAccess("marketing", "view");

  const google = googleAdsStatus();
  return <div><header className="mb-6"><p className="dd-eyebrow">Grow your business</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Marketing</h1><p className="mt-2 text-sm text-slate-500">Know your competition. Find your advantage. Turn it into profitable orders.</p><Link href="/amazon-marketing" className="dd-button mt-4">Amazon Marketing →</Link></header><PpcPlanner skus={SKUS} googleConfigured={google.configured} pushEnabled={google.pushEnabled} aiConfigured={llmConfigured()} searchConfigured={!!setting("BRAVE_SEARCH_API_KEY")} /></div>;
}
