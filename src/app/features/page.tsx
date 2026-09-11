import { requireSectionAccess } from "@/lib/permissions/guard";
import { FeatureLibrary } from "@/components/FeatureLibrary";
import { readFeatures } from "@/lib/features/store";
export const dynamic="force-dynamic";
export default async function FeaturesPage({searchParams}:{searchParams:Promise<{new?:string}>}) {
  await requireSectionAccess("admin", "view");

  const query=await searchParams,state=readFeatures();
  return <FeatureLibrary initial={{...state,trackers:state.trackers.map(t=>({...t,records:[]}))}} initialName={typeof query.new==="string"?query.new.slice(0,70):undefined}/>;
}
