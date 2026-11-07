import{readFileSync,writeFileSync}from'node:fs';
import{homedir}from'node:os';
import{createHash}from'node:crypto';
import path from'node:path';
import assert from'node:assert/strict';
const origin='https://gigtax.pro',checks=[];
const deployment=process.argv[2];
if(!/^dpl_[A-Za-z0-9]+$/.test(deployment||''))throw new Error('Pass the confirmed deployment ID.');
async function api(action,body={},cookie=''){
  const r=await fetch(origin+'/api/sales',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});
  return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
}
const anonymous=await api('bootstrap');assert.equal(anonymous.status,401);checks.push({check:'anonymous denial',status:401});
const login=await api('login',{code:readFileSync(path.join(homedir(),'.config/gigtax-sales/owner-code'),'utf8').trim()});
assert.equal(login.status,200);assert(login.cookie);assert(login.headers.get('set-cookie').includes('HttpOnly'));checks.push({check:'owner login and protected cookie',status:200});
const workspace=await api('bootstrap',{},login.cookie);assert.equal(workspace.status,200);assert.equal(workspace.json.user.role,'owner');assert.equal(workspace.json.terms.title,'Office membership · $300/month for 12 months + $200 enrollment');
checks.push({check:'authenticated real backend and confirmed terms',status:200,offices:workspace.json.offices.length,agents:workspace.json.agents.length,paymentsConfigured:workspace.json.paymentsConfigured,termsPublished:Boolean(workspace.json.terms)});
const discovery=await api('search',{city:'Hartford',state:'CT'},login.cookie);assert.equal(discovery.status,200);assert(discovery.json.results.length>0);checks.push({check:'real IRS discovery through deployed function',total:discovery.json.total,shown:discovery.json.results.length});
for(const base of [origin,'https://www.gigtax.pro']){
  const home=await fetch(base),bytes=Buffer.from(await home.arrayBuffer());assert.equal(home.status,200);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'857b2b50dcb082748b826b817e12d3573fd1a4961e5ea7051f5bc8e2c38d7c73');
  checks.push({check:'exact approved free customer homepage',origin:base,status:200});
  const sales=await fetch(base+'/sales');assert.equal(sales.status,200);assert((await sales.text()).includes('data-sales-app'));
  const pricing=await fetch(base+'/pricing',{redirect:'manual'});assert.equal(pricing.status,308);assert.equal(pricing.headers.get('location'),'/free');
}
for(const route of ['/join-the-family','/gig-companies','/app']){const r=await fetch(origin+route);assert.equal(r.status,404);checks.push({route,status:404});}
const csrf=await fetch(origin+'/api/sales',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json',Cookie:login.cookie},body:'{"action":"bootstrap"}'});assert.equal(csrf.status,403);checks.push({check:'foreign origin denied',status:403});
const webhook=await fetch(origin+'/api/sales-webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':'t=0,v1='+'0'.repeat(64)},body:'{}'});assert.equal(webhook.status,400);checks.push({check:'unsigned webhook denied',status:400});
const receipt={ok:true,verifiedAt:new Date().toISOString(),origin,deployment,implementation:'16240c6',approvedCustomerBaseline:'7e3244d',checks,payment:'No live Stripe account or webhook secret configured. No payment made; real paid activation unverified.',visual:'Safari opened on normal desktop; Luke screenshot acceptance still required.'};
writeFileSync('docs/deployments/gigtax-sales-live-api-proof-20261107.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
