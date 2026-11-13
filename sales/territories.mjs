import {readFileSync} from 'node:fs';
import {HttpError, STATES, digest, metadata, state, text} from './model.mjs';
import {patchReviewed} from './atomic.mjs';
import {localityAllowed, stateAllowed} from './territory-access.mjs';

const cache=new Map();
export const territoryManifest=JSON.parse(readFileSync(new URL('./territory-data/manifest.json',import.meta.url),'utf8'));
export function territoryCatalog(region) {
  state(region);
  if(!cache.has(region))cache.set(region,JSON.parse(readFileSync(new URL(`./territory-data/${region}.json`,import.meta.url),'utf8')));
  return cache.get(region);
}
export const territoryRevision = row => digest(JSON.stringify({states:metadata(row).states || [],territory:metadata(row).territory || null}));
export function agentTerritory(row) {
  const info=metadata(row);
  return {territory:info.territory || null,territoryRevision:territoryRevision(row)};
}
export function browseTerritories(user,body) {
  const region=state(body.state);
  if(!stateAllowed(user,region))throw new HttpError(403,'This state is outside your territory.');
  const query=text(body.query || '',100).toLowerCase(),offset=Number(body.offset || 0);
  if(!Number.isSafeInteger(offset)||offset<0)throw new HttpError(400,'Choose a valid town page.');
  const allowed=territoryCatalog(region).filter(row=>localityAllowed(user,region,row.name));
  const matches=allowed.filter(row=>!query||row.name.toLowerCase().includes(query));
  return {state:region,results:matches.slice(offset,offset+100),total:matches.length,stateTotal:allowed.length,offset,hasMore:offset+100<matches.length,
    source:territoryManifest.sources,version:territoryManifest.version,assignmentBasis:territoryManifest.assignmentBasis};
}
export function territoryTools(db,audit) {
  return async (user,action,body)=>{
    if(action==='territory-localities')return browseTerritories(user,body);
    if(user.role!=='owner')throw new HttpError(403,'Only the workspace owner can assign territories.');
    if(action!=='set-agent-territory')throw new HttpError(404,'Unknown territory action.');
    const region=state(body.state),before=await db.get('agents',body.id);
    if(!before||before.status!=='active')throw new HttpError(404,'Choose an active salesperson.');
    if(body.expectedRevision!==territoryRevision(before))throw new HttpError(409,'This salesperson’s territory changed. Refresh and review it before saving.');
    if(!['selected','state','none'].includes(body.mode))throw new HttpError(400,'Choose towns, the whole state, or no coverage.');
    const keys=body.mode==='selected'?body.cityKeys:[];
    if(!Array.isArray(keys)||keys.length>600||keys.some(key=>typeof key!=='string'))throw new HttpError(400,'Choose up to 600 towns per save, or assign the whole state.');
    const catalog=new Set(territoryCatalog(region).map(row=>row.key));
    if(keys.some(key=>!catalog.has(key)))throw new HttpError(400,'Choose towns from this state’s catalog.');
    if(body.mode==='selected'&&!keys.length)throw new HttpError(400,'Select at least one town or choose no coverage.');
    const info=metadata(before);
    // The first town assignment replaces legacy nationwide access. Explicit
    // legacy state assignments in other states are retained as whole states.
    const old=info.territory?.version===1?info.territory.areas:(info.states || []).map(state=>({state,cities:null}));
    const areas=old.filter(area=>area.state!==region);
    if(body.mode!=='none')areas.push({state:region,cities:body.mode==='state'?null:[...new Set(keys)].sort()});
    areas.sort((a,b)=>a.state.localeCompare(b.state));
    const territory={version:1,areas},states=areas.map(area=>area.state);
    const notes=JSON.stringify({...info,states,territory});
    if(notes.length>48000)throw new HttpError(400,'This territory selection is too large. Assign whole states or fewer individual towns.');
    const row=await patchReviewed(db,'agents',before,{notes});
    await audit(user,`agent:${before.id}`,'territory_assigned',{agentId:String(before.id),state:region,mode:body.mode,cities:keys.length});
    return {agent:{id:String(row.id),name:row.contact_name,states,...agentTerritory(row)}};
  };
}
