import { requireSectionAccess } from "@/lib/permissions/guard";
import { VisitPlanner } from "@/components/VisitPlanner";
import { readVisits } from "@/lib/visits/store";
import { setting } from "@/lib/connections/vault";
export const dynamic="force-dynamic";
export default async function VisitsPage(){
  await requireSectionAccess("distribution", "view");
return <VisitPlanner initial={readVisits()} browserKey={setting("GOOGLE_MAPS_BROWSER_KEY")} placesConfigured={!!setting("GOOGLE_MAPS_SERVER_KEY")}/>;}
