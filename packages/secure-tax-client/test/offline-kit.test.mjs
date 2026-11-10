import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {buildOfflineKit} from '../build-offline-kit.mjs';
import {generateRecipientKeyPair,publicKeyId,sealEnvelope} from '../envelope.mjs';

test('standalone separate-computer kit signs and recovers v2 data without app, tax engine or network dependencies',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'shuug-offline-kit-proof-')),kit=path.join(directory,'key-kit'),passphrase='Synthetic separate-computer backup phrase only.';
  try{
    const manifest=await buildOfflineKit(kit);assert(manifest.files.length>100);assert.equal(manifest.containsPrivateKeys,false);assert.equal(manifest.initialized,false);assert(!manifest.files.some(file=>/tax-engine|browser|cloud|firm\.json|trusted-config/.test(file.path)));
    for(const file of manifest.files){const bytes=await readFile(path.join(kit,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
    await assert.rejects(()=>buildOfflineKit(kit),/EEXIST/);assert((await readdir(kit)).includes('offline-cli.mjs'));
    const bundle=path.join(directory,'synthetic-firm.json'),pins=path.join(directory,'synthetic-pins.json');
    const run=async(command,args)=>{const child=spawn(process.execPath,[path.join(kit,'offline-cli.mjs'),command,'--confirm-off-host','--passphrase-fd','3','--bundle',bundle,'--public-pins',pins,...args],{cwd:directory,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe','pipe']});let errors='';child.stderr.on('data',data=>{errors+=data;});child.stdio[3].end(passphrase);const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{const [code]=await once(child,'exit');return {code,errors};}finally{clearTimeout(timer);}};
    assert.equal((await run('init',['--workspace-id','synthetic-offline-kit'])).code,0);assert.equal((await stat(bundle)).mode&0o777,0o600);const original=await readFile(bundle);assert.equal((await run('init',['--workspace-id','synthetic-offline-kit'])).code,1);assert.deepEqual(await readFile(bundle),original);
    const publicPins=JSON.parse(await readFile(pins,'utf8')),client=await generateRecipientKeyPair(),request={version:1,workspaceId:publicPins.workspaceId,accountId:'synthetic-account',clientId:'synthetic-client',client:{keyId:await publicKeyId(client.publicKey),publicKey:client.publicKey}},requestFile=path.join(directory,'request.json'),manifestFile=path.join(directory,'signed.json');await writeFile(requestFile,JSON.stringify(request));
    assert.equal((await run('sign',['--request',requestFile,'--epoch','1','--out',manifestFile])).code,0);
    const context={workspaceId:publicPins.workspaceId,accountId:request.accountId,objectId:'synthetic-offline-object',revision:1,domain:'tax-document'},plaintext=new TextEncoder().encode('SYNTHETIC LOCAL RECOVERY ONLY'),envelope=await sealEnvelope(plaintext,context,{clientPublicKey:client.publicKey,firmRecoveryPublicKey:publicPins.firmRecoveryPublicKey},'client',client.privateKey),envelopeFile=path.join(directory,'envelope.json'),expectedFile=path.join(directory,'expected.json'),recoveredFile=path.join(directory,'recovered.txt');await writeFile(envelopeFile,JSON.stringify(envelope));await writeFile(expectedFile,JSON.stringify({...context,clientId:request.clientId}));
    const result=await run('recover',['--manifest',manifestFile,'--envelope',envelopeFile,'--expected',expectedFile,'--out',recoveredFile]);assert.equal(result.code,0,result.errors);assert.deepEqual(await readFile(recoveredFile),Buffer.from(plaintext));
  }finally{await rm(directory,{recursive:true,force:true});}
});
