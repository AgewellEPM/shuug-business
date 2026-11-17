import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyPortalModules} from './verify-gigtax-portal-modules.mjs';
test('the final portal artifact refuses a missing extracted module or an unapproved external import',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'gigtax-portal-imports-'));
 try {
  await writeFile(path.join(folder,'index.html'),'<script type="importmap">{"imports":{}}</script>');
  await writeFile(path.join(folder,'app.mjs'),"import {feature} from './feature.mjs'; feature();");
  await assert.rejects(()=>verifyPortalModules(folder,['app.mjs']),/missing feature.mjs/);
  await writeFile(path.join(folder,'feature.mjs'),'export const feature=()=>true;');
  assert.deepEqual(await verifyPortalModules(folder,['app.mjs','feature.mjs']),{staticAndLiteralImports:1,reviewedNodeOnlyFallbacks:0,unresolvedImports:0});
  await writeFile(path.join(folder,'app.mjs'),"import 'https://foreign.example/records.mjs';");
  await assert.rejects(()=>verifyPortalModules(folder,['app.mjs','feature.mjs']),/unapproved module/);
  await writeFile(path.join(folder,'app.mjs'),"const name='unknown.mjs';import(name);");
  await assert.rejects(()=>verifyPortalModules(folder,['app.mjs','feature.mjs']),/nonliteral/);
 } finally {await rm(folder,{recursive:true,force:true});}
});
