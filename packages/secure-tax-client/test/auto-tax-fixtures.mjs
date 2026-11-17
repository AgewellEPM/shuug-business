// Disposable SYNTHETIC source rows; no real taxpayer/account material.
export const scope={profile:'client-only-v1',workspaceId:'synthetic-workspace',accountId:'synthetic-account',clientId:'synthetic-client'};
export const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
export const income=(id='synthetic-income',amountCents=1000000,date='2025-01-10',extra={})=>({id,revision:0,deleted:false,kind:'income',body:{date,platform:'uber',description:'SYNTHETIC original gross source',amountCents,currency:'USD',notes:'',...extra}});
export const expense=(id='synthetic-expense',amountCents=20000,category='supplies',extra={})=>({id,revision:0,deleted:false,kind:'expense',body:{date:'2025-01-10',merchant:'SYNTHETIC merchant',category,amountCents,currency:'USD',classification:'business',notes:'',receiptId:null,...extra}});
export const trip=(id='synthetic-trip',extra={})=>({id,revision:0,deleted:false,kind:'trip',body:{startedAt:Date.parse('2025-01-10T12:00:00Z'),endedAt:Date.parse('2025-01-10T13:00:00Z'),localDate:'2025-01-10',timeZoneId:'UTC',distanceMeters:1609.344,classification:'business',purpose:'SYNTHETIC business travel',notes:'',source:'gps',hasGaps:false,sampleCount:10,...extra}});
export function journal(records,{objectId='synthetic-journal',revision=1,extra={},entryExtra={}}={}){
  const binding={workspaceId:scope.workspaceId,accountId:scope.accountId,clientId:scope.clientId,objectId};
  const payload={version:1,type:'driver-journal',binding,capturedAt:Date.parse('2025-01-11T00:00:00Z'),journal:{version:1,entries:records.map(record=>({record,pendingMutationId:null,conflict:null,...entryExtra})),...extra}};
  return {objectId,revision,domain:'driver-state',scope:{...scope},journalBinding:binding,envelopeDigest:'SYNTHETIC-authenticated-source-digest',plaintext:bytes(payload)};
}
export const feed=(records,options={})=>new Map([['synthetic-journal',journal(records,options)]]);
export const standalone=record=>({objectId:'synthetic-object-'+record.id,revision:1,domain:'driver-record',scope:{...scope},envelopeDigest:'SYNTHETIC-authenticated-source-digest',plaintext:bytes({version:1,type:'driver-record',record})});
