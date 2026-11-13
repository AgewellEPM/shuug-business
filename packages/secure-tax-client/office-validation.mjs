export const reject=message=>{throw new Error(message??'The encrypted client finance record is invalid.');};
export function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))reject();}
export function identifier(value){if(typeof value!=='string'||value.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)?.[0]!==value)reject();return value;}
export function text(value,max,required=true){if(typeof value!=='string'||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))reject();return value;}
export function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)reject();return value;}
export function instant(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)reject();return value;}
export function cents(value,positive=false){if(!Number.isSafeInteger(value)||value<(positive?1:0)||value>99999999999)reject('Enter an exact cent amount within the supported limit.');return value;}
export function add(first,second){const value=first+second;if(!Number.isSafeInteger(value))reject('The total exceeds exact integer bounds.');return value;}
export function reference(value){exact(value,['objectId','revision','envelopeDigest','domain']);identifier(value.objectId);if(!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>1e9||!['tax-document','driver-receipt'].includes(value.domain)||typeof value.envelopeDigest!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.envelopeDigest))reject();return value;}
export const sameReference=(a,b)=>!!a&&!!b&&['objectId','revision','envelopeDigest','domain'].every(key=>a[key]===b[key]);
export function sourceStatus(ref,records){const item=records.get(ref.objectId);return !item||item.deleted?'unavailable':sameReference(ref,item)?'current':'stale';}
