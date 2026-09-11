import { requireSectionAccess } from "@/lib/permissions/guard";
import { AmazonMarketing } from "@/components/AmazonMarketing";
import { getAdsConfig } from "@/lib/amazon-ads/client";
import { SKUS } from "@/lib/data/seed";
import { loadWorkspace } from "@/lib/data/workspace";
export const dynamic="force-dynamic";
export default async function AmazonMarketingPage({searchParams}:{searchParams:Promise<{product?:string}>}){
  await requireSectionAccess("marketing", "view");
const params=await searchParams,{deals}=await loadWorkspace(),skus=deals[0]?.skus||SKUS;return <AmazonMarketing connected={!!getAdsConfig()} localProducts={skus.map(s=>({id:s.id,name:s.name}))} initialProductId={params.product}/>;}
