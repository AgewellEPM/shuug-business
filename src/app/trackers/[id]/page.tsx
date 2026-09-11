import { notFound } from "next/navigation";
import { readFeatures } from "@/lib/features/store";
import { TrackerWorkspace } from "@/components/TrackerWorkspace";
export const dynamic="force-dynamic";
export default async function TrackerPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,tracker=readFeatures().trackers.find(t=>t.id===id);
  if(!tracker)notFound();
  return <TrackerWorkspace key={tracker.id} initial={tracker}/>;
}
