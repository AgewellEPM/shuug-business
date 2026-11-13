import { writeFileSync } from 'node:fs';
import { socrataTaxBusinesses, lookupSocrataBusiness } from '../../sales/registry-socrata.mjs';

// Bounded public-source integration check. Records remain in memory; the receipt
// includes counts and source capabilities, not people's names or contact details.
const cities={CO:'Denver',NY:'Albany',OR:'Portland',PA:'Philadelphia',TX:'Austin'};
const results=[];
for(const [state,city] of Object.entries(cities)) {
  try {
    const search=await socrataTaxBusinesses(state,city);
    if(!search.results.length)throw new Error('No business records returned for the probe locality.');
    const selected=search.results[0],lookup=await lookupSocrataBusiness(selected);
    if(!lookup.matches.some(row=>row.registryId===selected.registryId))throw new Error('Selected business ID did not round-trip.');
    const row={state,city,ok:true,records:search.results.length,source:search.source,matchedRecords:lookup.matches.length,
      principals:lookup.matches.reduce((sum,row)=>sum+row.principals.length,0),registeredAgents:lookup.matches.reduce((sum,row)=>sum+row.registeredAgents.length,0)};
    results.push(row);console.log(JSON.stringify(row));
  }catch(error){const row={state,city,ok:false,error:error.message};results.push(row);console.log(JSON.stringify(row));}
}
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n',{flag:'wx'});
process.exitCode=results.every(row=>row.ok)?0:1;
