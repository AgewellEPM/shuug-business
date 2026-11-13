import { taxBusinesses, lookupBusiness } from './business-registry.mjs';
import { DATASETS, socrataTaxBusinesses, lookupSocrataBusiness } from './registry-socrata.mjs';
import { registryCoverage, registryLinks } from './registry-catalog.mjs';

export async function stateTaxBusinesses(region,locality,fetcher=fetch) {
  if(region==='CT')return taxBusinesses(region,locality,fetcher);
  if(DATASETS[region])return socrataTaxBusinesses(region,locality,fetcher);
  return {supported:false,results:[],truncated:false};
}
export async function lookupStateBusiness(candidate,fetcher=fetch) {
  const region=candidate.registryState || candidate.state,coverage=registryCoverage(region),links=registryLinks(candidate);
  if(!coverage.automaticRecords)return {supported:false,available:true,matches:[],coverage,links,
    message:`Open the ${coverage.name} official registry to check this business. Automatic record retrieval is not connected here yet; no owner or principal can be inferred from an empty result.`};
  try {
    const report=region==='CT'?await lookupBusiness(candidate,fetcher):await lookupSocrataBusiness(candidate,fetcher);
    return {...report,available:true,coverage,links};
  }catch(error){return {supported:true,available:false,matches:[],coverage,links,issues:[{code:'registry_unavailable',message:error.message}],
    message:`The ${coverage.name} automatic source is unavailable. Use the official registry link or retry. This is not evidence that the business is unregistered.`};}
}
