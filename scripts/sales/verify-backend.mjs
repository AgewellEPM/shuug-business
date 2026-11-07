import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {backend} from '../../sales/backend.mjs';
import {service} from '../../sales/service.mjs';
import {secret} from '../../sales/model.mjs';
import {agreement} from '../../sales/terms.mjs';
const config=JSON.parse(readFileSync(path.join(homedir(),'.config/gigtax-sales/installation.json'),'utf8'));
const testBoards={},archived=[],checks=[],suffix=secret().slice(0,8);
async function request(route,method='GET',body){const r=await fetch('https://tinkyspeak-tiles.tinkyspeak.workers.dev'+route,{method,headers:{Authorization:`Bearer ${config.GIGTAX_TINKY_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Backend proof HTTP ${r.status}`);return r.json();}
try {
  for(const kind of ['offices','agents','events','enrollments']){
    const result=await request('/api/outreach/boards','POST',{name:`GigTax diagnostic ${suffix} ${kind}`,config_json:{purpose:'synthetic-gigtax-proof',kind}});
    testBoards[kind]=result.board.id;
  }
  const env={...config,GIGTAX_SALES_BOARDS:JSON.stringify(testBoards)};
  const db=backend(env),app=service(env,db),owner={id:'owner',name:'Synthetic Owner',role:'owner',states:[]};
  await db.setTerms(agreement({business:'SYNTHETIC TEST ONLY — NO REAL AGREEMENT',cancellation:'Synthetic test. No contract, real office or payment.',approved:true}));
  const agent=await app.dispatch(owner,'create-agent',{name:'Synthetic Agent',email:`test-${suffix}@example.test`,states:['CT']});
  const login=await app.login({email:agent.agent.email,code:agent.code}),user=await app.identity(login.token);checks.push('live backend agent authentication');
  const input={name:`SYNTHETIC TEST OFFICE ${suffix}`,address:'123 Example Street',city:'Hartford',state:'CT',contact:'Synthetic Office Owner',email:'owner@example.test',independence:'independent',source:'https://example.test'};
  const {office}=await app.dispatch(user,'create-office',input);assert.equal(String(office.assigned_to),user.id);checks.push('live D1 office save and agent assignment');
  await app.dispatch(user,'activity',{id:office.id,kind:'call',note:'Synthetic persistence check; no call was made.'});
  const fresh=service(env,backend(env)),record=await fresh.dispatch(user,'office',{id:office.id});assert(record.events.length>=2);checks.push('fresh adapter reads persisted office and activity');
  const invite=await app.dispatch(user,'invite',{id:office.id,email:input.email,ownerName:input.contact});const fragment=new URLSearchParams(new URL(invite.link).hash.slice(1)),body={id:fragment.get('id'),token:fragment.get('token')};
  const view=await fresh.signup('view',body);assert.equal(view.terms.upfrontCents,50000);assert.equal(view.terms.termMonths,12);checks.push('real persisted invitation retains exact $500/12-month terms');
  await assert.rejects(fresh.signup('accept',{...body,email:input.email,signature:input.contact,termsHash:view.terms.hash,accepted:true,authorized:true,independent:true}),/Payment connection/);assert.equal((await db.get('offices',office.id)).status,'invited');checks.push('missing Stripe prevents real office activation');
  const other=await app.dispatch(owner,'create-agent',{name:'Other Synthetic Agent',email:`other-${suffix}@example.test`,states:['CT']});const second=await app.login({email:other.agent.email,code:other.code});await assert.rejects(app.dispatch(await app.identity(second.token),'office',{id:office.id}),/not found/);checks.push('second real agent cannot read first assignment');
  await app.dispatch(owner,'revoke-agent',{id:user.id});await assert.rejects(fresh.identity(login.token),/revoked/);checks.push('persisted revocation rejects existing session');
  const discovery=await db.discover('CT','Hartford');assert(discovery.results.length>0);checks.push(`real IRS download: ${discovery.total} Hartford candidates after filters`);
} finally {
  for(const id of Object.values(testBoards)){await request(`/api/outreach/boards/${id}`,'DELETE');archived.push(id);}
  const active=(await request('/api/outreach/boards')).boards;for(const id of archived)assert(active.find(b=>b.id===id)?.archived_at);
}
mkdirSync(path.resolve('docs/deployments'),{recursive:true});
const receipt={ok:true,verifiedAt:new Date().toISOString(),checks,diagnosticBoardsArchived:archived,payment:'No Stripe account configured. No actual payment made. Payment adapter covered by synthetic tests only.',visual:'No browser automation; visual acceptance remains with Luke.'};
writeFileSync('docs/deployments/gigtax-sales-backend-proof-20261107.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
