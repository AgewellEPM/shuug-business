import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,symlink,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateRecipientKeyPair} from '../envelope.mjs';
const repository=fileURLToPath(new URL('../../../',import.meta.url));
const node=(args)=>spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:1024*1024});
const guarded=[
 'packages/secure-tax-client/build-offline-kit.mjs',
 'packages/secure-tax-client/prepare-browser.mjs',
 'packages/secure-tax-client/public-config.mjs',
 'packages/secure-tax-client/cloud/aws/build-artifact.mjs',
 'packages/secure-tax-client/cloud/aws/validate.mjs',
 'packages/secure-tax-client/inspect-case-review.mjs',
 'scripts/tax/qualification-report.mjs',
];
async function aliasFixture(run){const root=await mkdtemp(path.join(tmpdir(),'synthetic CLI space #%-'));try{const alias=path.join(root,'linked repository # %');await symlink(repository,alias,'dir');await run({root,alias});}finally{await rm(root,{recursive:true,force:true});}}

test('absolute symlink entrypoints with spaces and URL characters execute their real CLI guards',async()=>{
 await aliasFixture(async({alias})=>{
  for(const relative of guarded.filter(file=>!file.endsWith('/validate.mjs'))){const direct=node([path.join(repository,relative),'--synthetic-invalid-argument']),linked=node([path.join(alias,relative),'--synthetic-invalid-argument']);assert.equal(direct.status,1,relative);assert.equal(linked.status,direct.status,`${relative}: ${linked.stderr}`);assert(linked.stderr.trim(),`${relative} silently skipped its CLI`);assert(!linked.stderr.includes('MODULE_NOT_FOUND'));}
  const relative='packages/secure-tax-client/cloud/aws/validate.mjs',direct=node([path.join(repository,relative)]),linked=node([path.join(alias,relative)]);assert.equal(linked.status,0,linked.stderr);assert.equal(linked.stdout,direct.stdout);const result=JSON.parse(linked.stdout);assert.equal(result.ok,true);assert.equal(result.sourcePolicyChecksPassed,true);assert.equal(result.awsServiceValidationPerformed,false);
 });
});

test('guarded Node modules remain import-only when argv is absent or names a missing filesystem path',()=>{
 const urls=guarded.map(relative=>pathToFileURL(path.join(repository,relative)).href);
 for(const argv of [[process.execPath],[process.execPath,path.join(tmpdir(),'missing synthetic argv # %.mjs')]]){const code=`process.argv=${JSON.stringify(argv)};for(const url of ${JSON.stringify(urls)})await import(url);process.stdout.write('import-only');`,result=node(['--input-type=module','-e',code]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'import-only');}
});

test('public configuration CLI through an absolute symlink writes exact public source bytes without activation',async()=>{
 await aliasFixture(async({root,alias})=>{
  const signing=await generateRecipientKeyPair(),recovery=await generateRecipientKeyPair(),pins={workspaceId:'synthetic-path-workspace',signerPublicKey:signing.publicKey,firmRecoveryPublicKey:recovery.publicKey},pinsFile=path.join(root,'original public pins # %.json'),output=path.join(root,'public output # %');await writeFile(pinsFile,JSON.stringify(pins));
  const result=node([path.join(alias,'packages/secure-tax-client/public-config.mjs'),'--pins',pinsFile,'--api-origin','https://api.example','--ui-origin','https://client.example','--output',output]);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).activationPerformed,false);assert.equal(JSON.parse(result.stdout).privateKeysIncluded,false);
  assert.equal(await readFile(path.join(output,'SecureTaxTrustedPins.json'),'utf8'),JSON.stringify({version:1,workspaceOrigin:'https://api.example',...pins},null,2)+'\n');
  const browser=JSON.parse(await readFile(path.join(output,'browser-public.json'),'utf8'));assert.equal(browser.signerPublicKey,pins.signerPublicKey);assert.equal(browser.firmRecoveryPublicKey,pins.firmRecoveryPublicKey);assert.equal(browser.uiOrigin,'https://client.example');assert((await realpath(output)).includes(' '));assert.equal(await readFile(pinsFile,'utf8'),JSON.stringify(pins));
 });
});
