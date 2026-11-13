// Public invitations contain a one-use setup secret. Names and contact details
// belong exclusively in the encrypted tax-identity object created by the client.
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function assertPrivateInvitation(value,workspaceId,now=Date.now()){
  const fields=['version','type','invitationId','workspaceId','accountId','clientId','token','expiresAt'];
  if(!value||Object.keys(value).sort().join('|')!==fields.sort().join('|')||value.version!==1||value.type!=='shuug-private-account-invitation'||value.workspaceId!==workspaceId||![value.invitationId,value.accountId,value.clientId].every(uuid)||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isFinite(Date.parse(value.expiresAt))||new Date(value.expiresAt).toISOString()!==value.expiresAt||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+49*3600000)throw new Error('Choose a current private invitation from this firm. It must arrive through the firm’s agreed private channel.');
  return value;
}
export function privateClientProfile(value){
  const fields=['legalName','email','phone','mailingAddress'];if(!value||Object.keys(value).sort().join('|')!==fields.sort().join('|'))throw new Error('Complete the private client profile.');
  const result={version:1,type:'client-profile'};
  for(const field of fields){const text=value[field];if(typeof text!=='string'||text.length>(field==='mailingAddress'?1000:field==='phone'?80:200)||/[\u0000-\u001f\u007f]/.test(text))throw new Error('Use ordinary bounded contact details.');result[field]=text.trim();}
  if(!result.legalName||result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw new Error('Enter the legal name and a valid contact email, or leave optional email blank.');return result;
}
export function privateAccountCode(value){if(!uuid(value))throw new Error('Enter the private account code supplied during setup. Names and email are not sign-in identifiers on this host.');return value;}
