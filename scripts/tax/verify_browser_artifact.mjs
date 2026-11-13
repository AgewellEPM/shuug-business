/** Execute the shipped ESM graph and PDF bundle in a V8/DOM model. This is
 * artifact integration evidence, not Safari, public TLS or visual acceptance. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createContext,SourceTextModule} from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';

const root=path.resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('Select the prepared independent-client artifact directory.');
const html=await readFile(path.join(root,'index.html'),'utf8'),dom=new JSDOM(html,{url:'https://disabled-artifact.example',pretendToBeVisual:true});
const imports=JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
const importmap=JSON.stringify({imports}),headers=await readFile(path.join(root,'_headers'),'utf8');assert(headers.includes(createHash('sha256').update(importmap).digest('base64')));assert(headers.includes("connect-src 'self'"));assert(!headers.includes('unsafe-inline'));
let fetchedTemplates=0,xfasRemoved=0,staffDom;
const server=createServer(async(request,response)=>{
  try{const url=new URL(request.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw new Error('Outside artifact.');const bytes=await readFile(file);response.writeHead(200,{'Content-Type':file.endsWith('.pdf')?'application/pdf':'text/javascript','Cache-Control':'no-store'});response.end(bytes);}catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,modules=new Map();
const context=createContext({document:dom.window.document,window:dom.window,location:dom.window.location,crypto:webcrypto,structuredClone,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,URL,Blob,Response,Request,Headers,performance,setTimeout,clearTimeout,setInterval,clearInterval,
  console:{...console,warn:message=>{assert.equal(message,'Removing XFA form data as pdf-lib does not support reading or writing XFA');xfasRemoved++;}},
  fetch:async(url,options)=>{const selected=new URL(url);assert.equal(selected.origin,origin);assert.match(selected.pathname,/^\/tax-engine\/forms\/202[345]\/f[0-9a-z]+\.pdf$/);fetchedTemplates++;return fetch(url,options);},
});
async function moduleFor(url){
  if(modules.has(url))return modules.get(url);
  const pending=(async()=>{const selected=new URL(url);assert.equal(selected.origin,origin);const file=path.resolve(root,'.'+selected.pathname);assert(file.startsWith(root+path.sep));const source=await readFile(file,'utf8');
    return new SourceTextModule(source,{context,identifier:url,initializeImportMeta:meta=>{meta.url=url;},importModuleDynamically:async(specifier,referencing)=>{const module=await resolve(specifier,referencing);if(module.status==='unlinked')await module.link(resolve);if(module.status==='linked')await module.evaluate();return module;}});
  })();modules.set(url,pending);return pending;
}
async function resolve(specifier,referencing){const target=imports[specifier]??specifier;if(!imports[specifier]&&!target.startsWith('.'))throw new Error('Unexpected unbundled import.');return moduleFor(new URL(target,imports[specifier]?origin+'/index.html':referencing.identifier).href);}
try{
  const app=await moduleFor(origin+'/browser/app.mjs');await app.link(resolve);await app.evaluate();
  assert(dom.window.document.querySelector('#tax-preparation'));assert.equal(dom.window.document.querySelector('#return-kind').disabled,true);assert.match(dom.window.document.querySelector('#message').textContent,/no independently supplied/);assert.equal(fetchedTemplates,0);
  const enrollment=dom.window.document.querySelector('#private-account-setup');assert(enrollment);assert([...enrollment.querySelectorAll('input,button')].every(control=>control.disabled));assert.equal(dom.window.document.querySelector('#change-password').disabled,true);
  const passwordRecovery=dom.window.document.querySelector('#password-recovery-setup');assert(passwordRecovery);assert([...passwordRecovery.querySelectorAll('input,button')].every(control=>control.disabled));
  const authenticatorRecovery=dom.window.document.querySelector('#authenticator-recovery-setup');assert(authenticatorRecovery);assert([...authenticatorRecovery.querySelectorAll('input,button')].every(control=>control.disabled));
  for(const id of ['renewal-request','renewal-file','install-renewal'])assert.equal(dom.window.document.getElementById(id).disabled,true);
  const engine=await moduleFor(origin+'/tax-engine/index.mjs'),pdf=await moduleFor(origin+'/tax-engine/pdf.mjs');if(pdf.status==='unlinked')await pdf.link(resolve);await pdf.evaluate();
  const exported=[];
  for(const year of [2023,2024,2025])for(const kind of ['1040','1065','1120S','1120']){const input=engine.namespace.newReturn(kind,year);input.party.name='Synthetic Artifact';input.party.taxId='000123456';if(input.individual)input.individual.w2s=[{id:'synthetic-w2',owner:'taxpayer',employer:'Synthetic employer',wagesCents:22000000,socialSecurityWagesCents:22000000,medicareWagesCents:22000000,federalWithholdingCents:500000,medicareTaxWithheldCents:337000}];else input.entity.receiptsCents=10000000;
    if(input.individual){const energy=engine.namespace.newEnergyCredits();Object.assign(energy.home,{street:'1 Example St',city:'Hartford',state:'CT',zip:'06103'});for(const key of Object.keys(energy.review))energy.review[key]=true;energy.items=[{id:'synthetic-energy',category:'heatPump',costCents:800000,qmid:'A1B2',source:'Synthetic source'}];input.individual.energyCredits=energy;}
    const packet=await pdf.namespace.generateDraftPdf(input);assert(packet.bytes.length>1000);assert.equal(packet.result.filingReady,false);if(kind==='1040'){assert.equal(packet.result.summary.additionalMedicareTaxCents,18000);assert.equal(packet.result.summary.additionalMedicareWithholdingCents,18000);assert(packet.audit.some(form=>form.form==='f8959'));assert.equal(packet.result.summary.energyImprovementCreditCents,200000);assert(packet.audit.some(form=>form.form==='f5695'));}exported.push({year,kind,bytes:packet.bytes.length});packet.bytes.fill(0);}
  staffDom=new JSDOM(await readFile(path.join(root,'staff.html'),'utf8'),{url:'https://disabled-artifact.example',pretendToBeVisual:true});context.document=staffDom.window.document;context.window=staffDom.window;context.location=staffDom.window.location;
  const staff=await moduleFor(origin+'/browser/staff-app.mjs');if(staff.status==='unlinked')await staff.link(resolve);await staff.evaluate();assert(staffDom.window.document.querySelector('#staff-return-editor #tax-preparation'));assert.equal(staffDom.window.document.querySelector('#staff-publish-return-edit').disabled,true);assert.equal(staffDom.window.document.querySelector('#staff-new-return').disabled,true);assert.match(staffDom.window.document.querySelector('#message').textContent,/no independently supplied/);
  for(const id of ['staff-create-client','staff-revoke-invitation','staff-disable-client','staff-enable-client','staff-create-password-recovery','staff-revoke-password-recovery'])assert.equal(staffDom.window.document.getElementById(id).disabled,true);
  for(const id of ['staff-renewal-request','staff-renewal-file','staff-install-renewal','staff-create-authenticator-recovery','staff-revoke-authenticator-recovery','staff-authenticator-request-id'])assert.equal(staffDom.window.document.getElementById(id).disabled,true);
  const caseEditor=staffDom.window.document.querySelector('#staff-case-editor #case-preparation');assert(caseEditor);const caseControls=[...caseEditor.querySelectorAll('input,textarea,select,button')];assert(caseControls.length>0);assert(caseControls.every(control=>control.disabled));for(const selector of ['#case-choice','#case-action','#case-title','#case-kind','#case-year'])assert.equal(caseEditor.querySelector(selector)?.disabled,true);
  const financeEditor=staffDom.window.document.querySelector('#client-finance-editor');assert(financeEditor);const financeControls=[...financeEditor.querySelectorAll('input,textarea,select,button')];assert(financeControls.length>0);assert(financeControls.every(control=>control.disabled));
  const names=await readdir(root);for(const file of ['firm-password-recovery.mjs','prepare-password-recovery-job.mjs','firm-recovery.mjs','firm-staff.mjs','offline-cli.mjs','staff-offline-cli.mjs','firm-return-edits.mjs','return-edit-offline-cli.mjs','return-edit-review.mjs','prepare-return-edit-job.mjs','firm-return-creations.mjs','return-create-offline-cli.mjs','return-create-review.mjs','prepare-return-create-job.mjs','firm-cases.mjs','case-offline-cli.mjs','case-review.mjs','prepare-case-job.mjs','inspect-case-review.mjs'])assert(!names.includes(file));
  for(const file of ['firm-enrollment-renewal.mjs','prepare-enrollment-renewal-job.mjs','firm-authenticator-recovery.mjs','prepare-authenticator-recovery-job.mjs'])assert(!names.includes(file));
  console.log(JSON.stringify({ok:true,artifact:root,verification:'Shipped ESM and PDF bundle in Node V8/DOM model',modules:modules.size,defaultConfigDisabled:true,noAccountRequest:true,authenticatorRecoveryMounted:true,staffAuthenticatorRecoveryControlsMounted:true,passwordRecoveryMounted:true,staffPasswordRecoveryControlsMounted:true,privateEnrollmentMounted:true,privateAccountControlsMounted:true,staffInvitationControlsMounted:true,staffAccountSuspensionControlsMounted:true,staffCorrectionEditorMounted:true,staffNewReturnControlMounted:true,staffCaseEditorMounted:true,staffCaseControlsDisabled:true,staffCaseControlCount:caseControls.length,staffFinanceEditorMounted:true,staffFinanceControlsDisabled:true,staffFinanceControlCount:financeControls.length,privateFirmModulesExcluded:true,publicTemplateFetches:fetchedTemplates,xfasRemoved,exported,safariVerified:false,visualAcceptance:false,publicTlsVerified:false},null,2));
}finally{await new Promise(resolve=>server.close(resolve));dom.window.close();staffDom?.window.close();}
