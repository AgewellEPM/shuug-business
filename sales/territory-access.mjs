// Territory coverage follows the office's recorded locality, not a ZIP prefix or
// approximate point on a map. State-only legacy agents retain their prior scope.
export const localityKey = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\bst\b/g,'saint');
export function stateAllowed(user, region) {
  if(user.role==='owner')return true;
  if(user.territory?.version===1)return user.territory.areas.some(area=>area.state===region);
  return !user.states?.length || user.states.includes(region);
}
export function localityAllowed(user, region, locality) {
  if(!stateAllowed(user,region))return false;
  if(user.role==='owner'||user.territory?.version!==1)return true;
  const area=user.territory.areas.find(area=>area.state===region);
  return area.cities===null || area.cities.includes(localityKey(locality));
}
