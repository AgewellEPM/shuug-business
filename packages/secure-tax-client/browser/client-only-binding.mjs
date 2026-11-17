import {PROFILE,canonicalClientOnlyManifest} from '../client-only.mjs';
import {decode64} from '../envelope.mjs';

const immutable=['id','profile','workspaceId','accountId','clientId','keyId'];
const validId=v=>typeof v==='string'&&v.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]===v;
const revision=v=>Number.isSafeInteger(v)&&v>=1&&v<=1e9+1;
function validate(value){
  if(!value||value.profile!==PROFILE||!['workspaceId','accountId','clientId'].every(k=>validId(value[k]))||value.id!==`${PROFILE}|${value.workspaceId}|${value.accountId}`||!Number.isInteger(value.minimumEpoch)||value.minimumEpoch<1||value.minimumEpoch>1e9)throw new Error('The client-only local binding is invalid. Its original was kept.');
  decode64(value.keyId,32);
  const m=value.manifest;
  canonicalClientOnlyManifest(m);
  decode64(m.signature.value,64);
  if(m.profile!==PROFILE||m.workspaceId!==value.workspaceId||m.accountId!==value.accountId||m.clientId!==value.clientId||m.client.keyId!==value.keyId||m.epoch!==value.minimumEpoch)throw new Error('The local manifest differs from the immutable client binding.');
  const versions=value.versions??{};
  if(!versions||typeof versions!=='object'||Array.isArray(versions)||Object.keys(versions).length>100000)throw new Error('The local revision history exceeds its supported format.');
  for(const [id,v] of Object.entries(versions))if(!validId(id)||!v||!revision(v.revision)||typeof v.deleted!=='boolean')throw new Error('The local revision history is invalid.');
  return versions;
}

/** Synchronous IndexedDB transaction updater. Stale tabs cannot replace a key,
 * regress an epoch, forget a tombstone or roll back a known object revision. */
export function mergeClientOnlyBinding(current,next,{complete=false}={}){
  const incoming=validate(next),prior=current?validate(current):{};
  if(current){
    if(immutable.some(k=>current[k]!==next[k]))throw new Error('Another account or client key already owns this local binding.');
    if(next.minimumEpoch<current.minimumEpoch)throw new Error('A newer client-only enrollment was already verified. Reconnect before retrying.');
    if(next.minimumEpoch===current.minimumEpoch&&(canonicalClientOnlyManifest(next.manifest)!==canonicalClientOnlyManifest(current.manifest)||next.manifest.signature.value!==current.manifest.signature.value))throw new Error('A changed enrollment reused the locally verified epoch.');
    if(complete&&Object.keys(prior).some(id=>!Object.hasOwn(incoming,id)))throw new Error('The full sync omitted a previously observed item or tombstone.');
  }
  const versions={...prior};
  for(const [id,v] of Object.entries(incoming)){
    const old=Object.hasOwn(prior,id)?prior[id]:null;
    if(old&&(v.revision<old.revision||old.deleted&&!v.deleted||v.revision===old.revision&&v.deleted!==old.deleted))throw new Error('Another tab observed a newer or deleted item. Refresh before retrying.');
    Object.defineProperty(versions,id,{value:{revision:v.revision,deleted:v.deleted},enumerable:true,writable:true,configurable:true});
  }
  return {id:next.id,profile:PROFILE,workspaceId:next.workspaceId,accountId:next.accountId,clientId:next.clientId,keyId:next.keyId,minimumEpoch:next.minimumEpoch,manifest:structuredClone(next.manifest),versions};
}
