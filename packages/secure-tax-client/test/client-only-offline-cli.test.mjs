import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSync,existsSync,mkdtempSync,openSync,readFileSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createFirmBundle,unlockFirmBundle} from '../firm-recovery.mjs';
import {generateRecipientKeyPair,publicKeyId} from '../envelope.mjs';
import {PROFILE,openClientOnlyEnvelope,sealClientOnlyEnvelope,verifyClientOnlyManifest} from '../client-only.mjs';
import {signClientOnlyEnrollment} from '../client-only-signing.mjs';

const passphrase='SYNTHETIC ONLY · disposable encrypted signer passphrase 789';
const cli=fileURLToPath(new URL('../client-only-offline-cli.mjs',import.meta.url));
async function fixture(){
  const directory=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-client-only-cli-')),file=name=>path.join(directory,name);
  const {bundle,publicPins}=await createFirmBundle('synthetic-workspace',passphrase),client=await generateRecipientKeyPair();
  const request={version:2,profile:PROFILE,workspaceId:publicPins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}};
  const write=(name,value)=>{writeFileSync(file(name),JSON.stringify(value),{mode:0o600});return file(name);};
  write('bundle.json',bundle);write('pins.json',publicPins);write('request.json',request);
  const args=({requestName='request.json',epoch=1,out='manifest.json',fd=0}={})=>['--confirm-off-host','--confirm-client-key','--bundle',file('bundle.json'),'--public-pins',file('pins.json'),'--request',file(requestName),'--epoch',String(epoch),'--out',file(out),'--passphrase-fd',String(fd)];
  const run=(values=args(),options={})=>spawnSync(process.execPath,[cli,...values],{input:passphrase+'\n',encoding:'utf8',maxBuffer:8192,timeout:10000,...options});
  const pins={version:2,profile:PROFILE,workspaceId:publicPins.workspaceId,signerPublicKey:publicPins.signerPublicKey};
  const expected={accountId:request.accountId,clientId:request.clientId,clientPublicKey:client.publicKey};
  const verify=(manifest,extra={})=>verifyClientOnlyManifest(manifest,{...expected,...extra},pins);
  return {directory,file,write,args,run,bundle,publicPins,client,request,pins,expected,verify};
}

test('real offline CLI signs only the exact client public binding via stdin or a dedicated passphrase FD',async()=>{
  const f=await fixture();
  try{
    const result=f.run();assert.equal(result.status,0,result.stderr);assert(!result.stdout.includes(passphrase));assert(!result.stderr.includes(passphrase));
    const manifest=JSON.parse(readFileSync(f.file('manifest.json'),'utf8'));
    assert.deepEqual(Object.keys(manifest).sort(),['version','profile','manifestId','workspaceId','accountId','clientId','epoch','client','issuedAt','expiresAt','signature'].sort());
    assert.equal(manifest.version,2);assert.equal(manifest.profile,PROFILE);assert.equal(manifest.epoch,1);assert.deepEqual(manifest.client,f.request.client);
    assert(!JSON.stringify(manifest).includes(f.publicPins.firmRecoveryPublicKey));assert(!('firmRecovery'in manifest));assert(!JSON.stringify(manifest).includes('"d":'));
    const verified=await f.verify(manifest);assert.deepEqual(verified.recipients,{clientPublicKey:f.client.publicKey});assert.equal(statSync(f.file('manifest.json')).mode&0o777,0o600);
    // Actual client-only ciphertext can be opened with the client key; possessing
    // the real disposable offhost bundle still grants no decryption recipient.
    const firm=await unlockFirmBundle(f.bundle,passphrase,f.publicPins),context={workspaceId:f.request.workspaceId,accountId:f.request.accountId,objectId:'synthetic-private-object',revision:1,domain:'tax-identity'},plaintext=new TextEncoder().encode('SYNTHETIC client-held record');
    const envelope=await sealClientOnlyEnvelope(plaintext,context,verified.recipients,'client',f.client.privateKey);
    assert.equal(envelope.recipients.length,1);assert.deepEqual(await openClientOnlyEnvelope(envelope,context,verified.recipients,'client',f.client.privateKey),plaintext);
    await assert.rejects(()=>openClientOnlyEnvelope(envelope,context,verified.recipients,'client',firm.recovery));
    await assert.rejects(()=>openClientOnlyEnvelope(envelope,context,verified.recipients,'firm-recovery',firm.recovery));
    writeFileSync(f.file('synthetic-passphrase.txt'),passphrase+'\r\n',{mode:0o600});
    const descriptor=openSync(f.file('synthetic-passphrase.txt'),'r');
    try{
      const dedicated=f.run(f.args({fd:3,out:'fd-manifest.json'}),{input:'SYNTHETIC stdin must not be used',stdio:['pipe','pipe','pipe',descriptor]});
      assert.equal(dedicated.status,0,dedicated.stderr);await f.verify(JSON.parse(readFileSync(f.file('fd-manifest.json'),'utf8')));
    }finally{closeSync(descriptor);}
  }finally{rmSync(f.directory,{recursive:true,force:true});}
});

test('renewal verifies an expired prior signature, advances minimum epoch and refuses replacement keys or identities',async()=>{
  const f=await fixture();
  try{
    const unlocked=await unlockFirmBundle(f.bundle,passphrase,f.publicPins),past=Date.now()-3*86400000;
    const previous=await signClientOnlyEnrollment(unlocked,f.request,{epoch:3,now:past,validForMs:86400000});
    await assert.rejects(()=>f.verify(previous));
    const renewal={profile:PROFILE,minimumEpoch:5,previous,request:f.request};f.write('renewal.json',renewal);
    const low=f.run(f.args({requestName:'renewal.json',epoch:4,out:'too-low.json'}));assert.equal(low.status,1);assert.equal(existsSync(f.file('too-low.json')),false);
    const result=f.run(f.args({requestName:'renewal.json',epoch:5,out:'renewed.json'}));assert.equal(result.status,0,result.stderr);
    const renewed=JSON.parse(readFileSync(f.file('renewed.json'),'utf8'));assert.deepEqual(renewed.client,previous.client);assert.equal(renewed.epoch,5);await f.verify(renewed,{minimumEpoch:5});
    const replacement=await generateRecipientKeyPair(),replacementClient={keyId:await publicKeyId(replacement.publicKey),publicKey:replacement.publicKey};
    const invalid=[
      {...renewal,minimumEpoch:3},
      {...renewal,request:{...f.request,client:replacementClient}},
      {...renewal,request:{...f.request,accountId:'synthetic-other-account'}},
      {...renewal,request:{...f.request,clientId:'synthetic-other-client'}},
      {...renewal,request:{...f.request,workspaceId:'synthetic-other-workspace'}},
      {...renewal,previous:{...previous,epoch:2}},
      {...renewal,previous:{...previous,signature:{...previous.signature,value:'A'.repeat(86)}}},
      {...renewal,previous:undefined},
      {...renewal,profile:'legacy'},
      {...renewal,minimumEpoch:0},
      {...renewal,minimumEpoch:1e9+1},
      {...renewal,minimumEpoch:5.5},
      {...renewal,firmRecovery:{publicKey:f.publicPins.firmRecoveryPublicKey}},
    ];
    for(const [index,input]of invalid.entries()){
      const requestName='invalid-renewal-'+index+'.json',out='invalid-renewal-'+index+'-out.json';f.write(requestName,input);
      const result=f.run(f.args({requestName,epoch:index===0?3:5,out}));assert.equal(result.status,1,'renewal '+index+' unexpectedly signed');assert.equal(existsSync(f.file(out)),false);
    }
  }finally{rmSync(f.directory,{recursive:true,force:true});}
});

test('invalid public inputs, missing acknowledgments, wrong passphrases and output clobber fail without replacing files',async()=>{
  const f=await fixture();
  try{
    const invalid=[{...f.request,version:1},{...f.request,profile:'legacy'},{...f.request,accountId:'trailing-newline\n'},{...f.request,firmRecovery:{publicKey:f.publicPins.firmRecoveryPublicKey}},{...f.request,client:{...f.request.client,keyId:'wrong-fingerprint'}},{...f.request,client:{publicKey:f.publicPins.signerPublicKey,keyId:await publicKeyId(f.publicPins.signerPublicKey)}}];
    for(const [index,input]of invalid.entries()){
      const requestName='invalid-'+index+'.json',out='invalid-'+index+'-out.json';f.write(requestName,input);
      assert.equal(f.run(f.args({requestName,out})).status,1);assert.equal(existsSync(f.file(out)),false);
    }
    for(const flag of ['--confirm-off-host','--confirm-client-key'])assert.equal(f.run(f.args({out:'unacknowledged.json'}).filter(value=>value!==flag)).status,1);
    assert.equal(existsSync(f.file('unacknowledged.json')),false);
    assert.equal(f.run(f.args({out:'bad-password.json'}),{input:'SYNTHETIC incorrect long passphrase\n'}).status,1);assert.equal(existsSync(f.file('bad-password.json')),false);
    const original='SYNTHETIC existing operator output; must remain byte-identical\n';writeFileSync(f.file('existing.json'),original);
    assert.equal(f.run(f.args({out:'existing.json'})).status,1);assert.equal(readFileSync(f.file('existing.json'),'utf8'),original);
    symlinkSync(f.file('existing.json'),f.file('symlink-output.json'));assert.equal(f.run(f.args({out:'symlink-output.json'})).status,1);assert.equal(readFileSync(f.file('existing.json'),'utf8'),original);
    symlinkSync(f.file('request.json'),f.file('symlink-request.json'));assert.equal(f.run(f.args({requestName:'symlink-request.json',out:'symlink-input-out.json'})).status,1);assert.equal(existsSync(f.file('symlink-input-out.json')),false);
  }finally{rmSync(f.directory,{recursive:true,force:true});}
});
