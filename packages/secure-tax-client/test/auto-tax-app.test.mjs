import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {createSyntheticClientOnlyFixture} from '../client-only-interop-fixture.mjs';
import {decode64,encode64} from '../envelope.mjs';
import {sealClientOnlyEnvelope,openClientOnlyEnvelope} from '../client-only.mjs';

// Node's ESM VM capability needs its explicit built-in flag. Keep the normal
// package test command usable without altering source files or package scripts.
if(!vm.SourceTextModule){
  test('actual configured browser app connects, unlocks, prepares/persists/refreshes a client-only draft and clears on lock',()=>{
    const environment={...process.env};delete environment.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-reporter=spec',fileURLToPath(import.meta.url)],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:environment});
    assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,(result.stdout??'')+(result.stderr??''));
    assert.match(result.stdout,/configured app surface: synthetic encrypted Journal/);
  });
}else{
  test('configured app surface: synthetic encrypted Journal → actual unlock button → automatic encrypted tax draft → refresh → lock',async t=>{
    const packageRoot=fileURLToPath(new URL('../',import.meta.url)),repository=path.resolve(packageRoot,'../..'),browser=path.join(packageRoot,'browser');
    const f=await createSyntheticClientOnlyFixture(),publicBytes=decode64(f.clientPublicKey,65);
    const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(publicBytes.subarray(1,33)),y:encode64(publicBytes.subarray(33)),d:f.clientPrivateKey},{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    assert.equal(privateKey.extractable,false);
    const config={...f.pins,uiOrigin:'https://synthetic-app.example',apiOrigin:'https://synthetic-api.example'},identity={accountId:f.manifest.accountId,clientId:f.manifest.clientId};
    class MemoryStore{
      keys=new Map([[f.manifest.client.keyId,{keyId:f.manifest.client.keyId,publicKey:f.clientPublicKey,privateKey}]]);bindings=new Map();
      async listKeys(){return [...this.keys.values()].map(({keyId,publicKey})=>({keyId,publicKey}));}
      async getKey(id){return this.keys.get(id);}
      async putKey(entry){this.keys.set(entry.keyId,entry);}
      async getBinding(id){return structuredClone(this.bindings.get(id));}
      async putBinding(value){this.bindings.set(value.id,structuredClone(value));}
      async updateBinding(id,update){const value=update(structuredClone(this.bindings.get(id)));this.bindings.set(id,structuredClone(value));return structuredClone(value);}
    }
    const storage=new MemoryStore(),objects=new Map(),mutations=new Map(),requests=[];let sequence=0;
    const journalId='33333333-3333-4333-8333-333333333333';
    async function mobileJournal(amountCents){
      const context={workspaceId:config.workspaceId,accountId:identity.accountId,objectId:journalId,revision:(objects.get(journalId)?.revision??0)+1,domain:'driver-state'};
      const payload={version:1,type:'driver-journal',binding:{workspaceId:config.workspaceId,...identity,objectId:journalId},capturedAt:Date.now(),journal:{version:1,entries:[
        {record:{id:'11111111-1111-4111-8111-111111111111',revision:0,deleted:false,kind:'income',body:{date:'2025-05-06',platform:'uber',description:'SYNTHETIC PRIVATE APP GROSS SOURCE',amountCents,currency:'USD',notes:''}}},
        {record:{id:'22222222-2222-4222-8222-222222222222',revision:0,deleted:false,kind:'expense',body:{date:'2025-05-06',merchant:'SYNTHETIC PRIVATE APP FEE SOURCE',category:'fees',amountCents:50000,currency:'USD',classification:'business',businessUsePercent:100,businessPurpose:'SYNTHETIC original platform fee',notes:'',receiptId:null}}},
      ],receipts:[]}};
      const bytes=new TextEncoder().encode(JSON.stringify(payload));
      try{const envelope=await sealClientOnlyEnvelope(bytes,context,{clientPublicKey:f.clientPublicKey},'client',privateKey);objects.set(journalId,{objectId:journalId,revision:context.revision,sequence:++sequence,deleted:false,envelope});}
      finally{bytes.fill(0);}
    }
    await mobileJournal(2000000);
    const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}),receipt=row=>({objectId:row.objectId,revision:row.revision,sequence:row.sequence,deleted:row.deleted});
    const fetcher=async(address,options={})=>{
      const url=new URL(address);assert.equal(url.origin,config.apiOrigin,'the app must use only the configured in-memory API');assert.ok(url.pathname.startsWith('/api/website/customer/client-only/'));
      requests.push({url:address,options:structuredClone(options)});
      const id=decodeURIComponent(url.pathname.split('/').at(-1));
      if(url.pathname.endsWith('/social/config'))return respond({apiVersion:1,providers:{google:false,apple:false}});
      if(id==='status')return respond({profile:'client-only-v1',enrolled:true,identity,manifest:f.manifest});
      if(id==='objects'){
        const after=Number(url.searchParams.get('after')),changes=[...objects.values()].filter(row=>row.sequence>after).sort((a,b)=>a.sequence-b.sequence).map(receipt);
        return respond({changes,cursor:changes.at(-1)?.sequence??after,hasMore:false});
      }
      if(options.method==='GET'){assert(objects.has(id),'the requested synthetic object exists');return respond(objects.get(id));}
      assert.equal(options.method,'PUT','no account mutation or destructive route is authorized in this proof');
      const input=JSON.parse(options.body),prior=mutations.get(input.mutationId);
      if(prior){assert.equal(options.body,prior.body);return respond(receipt(prior.row));}
      if(input.expectedRevision!==(objects.get(id)?.revision??0))return respond({error:'SYNTHETIC CAS conflict'},409);
      assert.equal(input.envelope.version,3);assert.equal(input.envelope.profile,'client-only-v1');assert.equal(input.envelope.recipients.length,1);assert.equal(input.envelope.recipients[0].publicKey,f.clientPublicKey);
      const row={objectId:id,revision:input.expectedRevision+1,sequence:++sequence,deleted:false,envelope:input.envelope};objects.set(id,row);mutations.set(input.mutationId,{body:options.body,row});return respond(receipt(row));
    };
    const html=await readFile(path.join(browser,'index.html'),'utf8'),dom=new JSDOM(html,{url:config.uiOrigin,pretendToBeVisual:true}),document=dom.window.document;
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    const intervals=new Map(),timeouts=new Set();let nextInterval=0;
    const context=vm.createContext({document,window:dom.window,location:dom.window.location,crypto:globalThis.crypto,structuredClone,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,CryptoKey:globalThis.CryptoKey,URL,Blob,Response,Request,Headers,performance,btoa,atob,fetch:fetcher,
      setInterval:(callback,delay)=>{const id=++nextInterval;intervals.set(id,{callback,delay});return id;},clearInterval:id=>intervals.delete(id),
      setTimeout:(callback,delay,...args)=>{const timer=setTimeout(()=>{timeouts.delete(timer);callback(...args);},delay);timeouts.add(timer);return timer;},clearTimeout:timer=>{clearTimeout(timer);timeouts.delete(timer);},
      confirm:()=>{throw new Error('No destructive action or readable download is authorized in the synthetic proof.');},console:{log:()=>{},warn:()=>{},error:()=>{}},
    });
    const modules=new Map(),loaded=new Set(),custodyPath=path.join(browser,'custody.mjs');let custodyShim;
    const alias={
      '@hpke/core':path.join(packageRoot,'node_modules/@hpke/core/esm/mod.js'),
      '@hpke/common':path.join(packageRoot,'node_modules/@hpke/common/esm/mod.js'),
      '@shuug/tax-engine':path.join(repository,'packages/tax-engine/index.mjs'),
      '@shuug/tax-engine/pdf':path.join(repository,'packages/tax-engine/pdf.mjs'),
      'pdf-lib':path.join(repository,'node_modules/pdf-lib/dist/pdf-lib.esm.js'),
    };
    async function moduleFor(file){
      file=path.resolve(file);if(modules.has(file))return modules.get(file);
      const pending=(async()=>{
        assert(file.startsWith(repository+path.sep),'load only this source tree and its already installed dependencies');loaded.add(file);
        return new vm.SourceTextModule(await readFile(file,'utf8'),{context,identifier:pathToFileURL(file).href,initializeImportMeta:meta=>{meta.url=pathToFileURL(file).href;},importModuleDynamically:async(specifier,reference)=>{const module=await resolve(specifier,reference);if(module.status==='unlinked')await module.link(resolve);if(module.status==='linked')await module.evaluate();return module;}});
      })();modules.set(file,pending);return pending;
    }
    async function resolve(specifier,reference){
      const target=alias[specifier]??(specifier.startsWith('.')?fileURLToPath(new URL(specifier,reference.identifier)):null);
      assert(target,'unexpected unbundled or Node/network import: '+specifier);
      if(path.resolve(target)===path.join(browser,'trusted-config.mjs'))return new vm.SyntheticModule(['default'],function(){this.setExport('default',config);},{context,identifier:'synthetic:installed-public-pins'});
      if(path.resolve(target)===custodyPath&&custodyShim)return custodyShim;
      return moduleFor(target);
    }
    async function settled(predicate,label){
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
      assert.fail(label+'; app message: '+document.querySelector('#message')?.textContent+'; private panel: '+document.querySelector('#auto-tax-view')?.textContent);
    }
    try{
      // Execute every custody helper from its real source; override only its
      // default persistence adapter, with the same interface as IndexedDB.
      const custody=await moduleFor(custodyPath);await custody.link(resolve);await custody.evaluate();
      const exportNames=Object.keys(custody.namespace);
      custodyShim=new vm.SyntheticModule(exportNames,function(){for(const name of exportNames)this.setExport(name,name==='BrowserKeyStore'?class{constructor(){return storage;}}:custody.namespace[name]);},{context,identifier:'synthetic:device-key-store'});
      const app=await moduleFor(path.join(browser,'app.mjs'));await app.link(resolve);await app.evaluate();
      assert.match(document.querySelector('#message').textContent,/Independent trust configuration loaded/);
      assert.equal(document.querySelector('#auto-tax-view').hidden,true);assert.equal(document.querySelector('#connect').disabled,false);
      document.querySelector('#connect').click();await settled(()=>!document.querySelector('#unlock').disabled,'connect button must enable the original local client key');
      document.querySelector('#unlock').click();await settled(()=>document.querySelector('#auto-tax-save-status')?.textContent==='Current draft saved encrypted in your private workspace.'&&!document.querySelector('#sync').disabled,'unlock must finish automatic preparation and save');
      const panel=document.querySelector('#auto-tax-view');assert.equal(panel.hidden,false);assert.equal(document.querySelector('#auto-tax-year').value,'2025');assert.match(panel.textContent,/\$20,000\.00/);assert.match(panel.textContent,/\$500\.00/);assert.match(panel.textContent,/Needs review/);assert.equal(document.querySelector('#auto-tax-income-confirmed').checked,false);
      let taxObjects=[...objects.values()].filter(row=>row.envelope.context.domain==='tax-document');assert.equal(taxObjects.length,1,'unlock creates exactly one managed encrypted draft without a Generate/Calculate click');
      const first=taxObjects[0],opened=await openClientOnlyEnvelope(first.envelope,first.envelope.context,{clientPublicKey:f.clientPublicKey},'client',privateKey),packet=JSON.parse(new TextDecoder().decode(opened));opened.fill(0);
      assert.equal(packet.type,'client-auto-tax-draft');assert.equal(packet.year,2025);assert.equal(packet.input.individual.businesses[0].receiptsCents,2000000);assert(packet.input.features.includes('auto-tax:income-review'));
      assert([...intervals.values()].some(value=>value.delay===15000),'the actual private portal starts its visible/unlocked 15-second poller');
      await mobileJournal(2100000);
      const check=[...document.querySelectorAll('#client-portal button')].find(button=>button.textContent==='Check for updates now');assert(check);assert.equal(check.disabled,false);check.click();
      await settled(()=>objects.get(first.objectId)?.revision===first.revision+1&&document.querySelector('#auto-tax-save-status')?.textContent==='Current draft saved encrypted in your private workspace.'&&!document.querySelector('#sync').disabled,'manual update check must synchronize and regenerate the same draft');
      taxObjects=[...objects.values()].filter(row=>row.envelope.context.domain==='tax-document');assert.equal(taxObjects.length,1);assert.equal(taxObjects[0].objectId,first.objectId);assert.match(document.querySelector('#auto-tax-view').textContent,/\$21,000\.00/);assert.match(document.querySelector('#portal-dashboard').textContent,/\$21,000\.00|21000\.00/);
      const latest=await openClientOnlyEnvelope(taxObjects[0].envelope,taxObjects[0].envelope.context,{clientPublicKey:f.clientPublicKey},'client',privateKey);
      try{assert.equal(JSON.parse(new TextDecoder().decode(latest)).input.individual.businesses[0].receiptsCents,2100000);}finally{latest.fill(0);}
      const puts=requests.filter(row=>row.options.method==='PUT');assert.equal(puts.length,2);
      for(const {options}of puts){assert(!options.body.includes('SYNTHETIC PRIVATE APP'));assert(!options.body.includes('client-auto-tax-draft'));assert(!options.body.includes('receiptsCents'));assert.equal(JSON.parse(options.body).envelope.recipients.length,1);}
      assert(!JSON.stringify([...storage.bindings.values()]).includes('SYNTHETIC PRIVATE APP'),'persistent client metadata contains only encrypted retry/history entries');
      for(const name of ['app.mjs','client.mjs','auto-tax-controller.mjs','auto-tax-model.mjs','auto-tax-records.mjs','auto-tax-view.mjs','client-portal-view.mjs'])assert(loaded.has(path.join(browser,name)),'actual source module executed: '+name);
      const beforeLock=requests.length;document.querySelector('#lock').click();
      assert.equal(document.querySelector('#auto-tax-view').hidden,true);assert.equal(document.querySelector('#auto-tax-view').textContent,'');assert.equal(document.querySelector('#groups').childElementCount,0);assert.equal(document.querySelector('#portal-dashboard').childElementCount,0);assert.equal(intervals.size,0);assert.equal(requests.length,beforeLock);assert.match(document.querySelector('#message').textContent,/View locked/);
      assert(!document.body.textContent.includes('SYNTHETIC PRIVATE APP GROSS SOURCE'));assert(![...document.querySelectorAll('input,textarea')].some(input=>input.value.includes('SYNTHETIC PRIVATE APP')));
      t.diagnostic(JSON.stringify({syntheticOnly:true,actualEntrypoint:'browser/app.mjs',firstIncome:'$20,000.00',updatedIncome:'$21,000.00',recordedExpense:'$500.00',encryptedDraftCount:1,encryptedDraftRevisions:[first.revision,taxObjects[0].revision],clientRecipients:1,lockCleared:true,networkRequests:'in-memory fetch only',limit:'Node V8/JSDOM source integration; not Safari, phone, hosted enrollment or visual acceptance'}));
    }finally{for(const timer of timeouts)clearTimeout(timer);intervals.clear();dom.window.close();}
  });
}
