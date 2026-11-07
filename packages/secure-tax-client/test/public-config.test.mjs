import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateRecipientKeyPair} from '../envelope.mjs';
import {publicConfiguration,writePublicConfiguration} from '../public-config.mjs';
test('public trust package consistently configures native/browser/API without accepting private bundle fields or activating',async()=>{
 const signer=await generateRecipientKeyPair(),recovery=await generateRecipientKeyPair();
 const pins={workspaceId:'synthetic-workspace',signerPublicKey:signer.publicKey,firmRecoveryPublicKey:recovery.publicKey};
 const origins={apiOrigin:'https://api.example',uiOrigin:'https://client.example'};
 const config=await publicConfiguration(pins,origins);assert.equal(config.native.workspaceOrigin,config.browser.apiOrigin);assert.equal(config.environment.SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY,pins.firmRecoveryPublicKey);
 await assert.rejects(()=>publicConfiguration({...pins,privateKey:'forbidden'},origins));
 await assert.rejects(()=>publicConfiguration(pins,{...origins,uiOrigin:origins.apiOrigin}));
 await assert.rejects(()=>publicConfiguration(pins,{...origins,apiOrigin:'http://api.example'}));
 const root=await mkdtemp(path.join(tmpdir(),'synthetic-public-config-'));
 try{
  const output=path.join(root,'public');const result=await writePublicConfiguration(config,output);assert.equal(result.privateKeysIncluded,false);assert.equal(result.activationPerformed,false);
  assert.deepEqual(JSON.parse(await readFile(path.join(output,'SecureTaxTrustedPins.json'),'utf8')),config.native);
  await assert.rejects(()=>writePublicConfiguration(config,output));
 }finally{await rm(root,{recursive:true,force:true});}
});
