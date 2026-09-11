import { requireSectionAccess } from "@/lib/permissions/guard";
import { ShippingPipeline } from "@/components/ShippingPipeline";
import { getAmazonConfig } from "@/lib/amazon/client";
import { accountKey,readAmazon } from "@/lib/amazon/store";
export const dynamic="force-dynamic";
export default async function AmazonPage(){
  await requireSectionAccess("operations", "view");
const config=getAmazonConfig();return <ShippingPipeline configured={!!config} initial={config?readAmazon(accountKey(config)):null}/>;}
