import { escapeHtml } from "../auth/forms";
import { customerPage } from "../customer-access/page";
import { CUSTOMER_PATH } from "../customer-access/accounts";
import { argylePath } from "./argyle-http";
import type { argyleSummary } from "./argyle-service";
const e=(value:unknown)=>escapeHtml(String(value??""));
export function argylePortalCard() {return `<section id="gig-connections"><h2>Your connected gig accounts</h2><p>Link your work accounts once. See the jobs, pay and updates each service shares with this client profile.</p><a href="${argylePath}">Open connected work</a><p><small>Account data availability and update speed vary by platform. A connection does not establish live incoming-offer access.</small></p></section>`;}
export function argylePage(summary:ReturnType<typeof argyleSummary>) {
  const response=customerPage("Your connected work",`<section><h2>Keep your work accounts together</h2><p id="argyle-availability">${e(summary.availability)}</p><p>${summary.environment==="sandbox"?"Provider test mode — sample accounts and records only.":"Production account connections"}</p>
    <p>Connection: <strong id="argyle-state">${e(summary.status)}</strong></p><p id="argyle-notice" role="status" aria-live="polite"></p>
    ${summary.ready?`<button type="button" id="argyle-connect">Connect a gig account</button> <button type="button" id="argyle-refresh">Check for account updates</button><p>Argyle handles the work-account sign-in. We do not ask for your gig-app password.</p>`:""}
    ${summary.canDisconnect?`<form id="argyle-disconnect"><label><input type="checkbox" name="confirm" required> Disconnect all gig accounts linked through Argyle. Keep previously imported history.</label><button>Disconnect accounts</button></form>`:""}</section>
    <section><h2>Your accounts</h2><p id="argyle-last-update">${summary.lastSyncAt?`Last received: ${e(summary.lastSyncAt)}`:"No account records received yet."}</p><div id="argyle-accounts">${summary.accounts.map(a=>`<article><h3>${e(a.name)}</h3><p>${e(a.status)} · Provider refresh: ${e(a.refreshFrequency??"not confirmed")}</p><p>${e(a.limitations??"")}</p></article>`).join("")}</div></section>
    <section><h2>Jobs and pay from your accounts</h2><p>${e(summary.accountingNote)}</p><div class="scroll"><table><thead><tr><th>Work app</th><th>Job</th><th>Pay</th><th>Source updated</th><th>Received here</th><th>Delivery delay</th></tr></thead><tbody id="argyle-records"></tbody></table></div><p id="argyle-record-count">${summary.records.length} received records</p></section>
    <section><h2>How current is this?</h2><p>We show when the provider changed a record and when this workspace received it. A job may arrive after it ends. Check the provider’s refresh interval and measured delay before using the data for time-sensitive choices.</p><p>${e(summary.liveOfferNote)}</p></section><p><a href="${CUSTOMER_PATH}">Return to your client account</a></p>
    <script src="https://plugin.argyle.com/argyle.web.v5.js" defer></script><script src="${argylePath}/client.js" defer></script>`);
  response.headers.set("Content-Security-Policy","default-src 'none'; script-src 'self' https://plugin.argyle.com; connect-src 'self' https://*.argyle.com; frame-src https://*.argyle.com; worker-src 'self' blob:; style-src 'unsafe-inline' https://*.argyle.com; img-src 'self' data: https://*.argyle.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  return response;
}
export const argyleClientScript=String.raw`(() => {
  const base='/api/website/customer/connections/argyle';
  const notice=document.getElementById('argyle-notice'); let link, busy=false, stopped=false;
  function message(value){notice.textContent=value;}
  async function request(path,body){
    const result=await fetch(base+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await result.json();if(!result.ok)throw new Error(data.error||'The account connection needs attention.');return data;
  }
  function cell(row,value){const td=document.createElement('td');td.textContent=value??'Not supplied';row.append(td);}
  async function refresh(){
    const data=await request('/summary'); if(stopped)return;
    document.getElementById('argyle-state').textContent=data.status;
    document.getElementById('argyle-last-update').textContent=data.lastSyncAt?'Last received: '+data.lastSyncAt:'No account records received yet.';
    const accounts=document.getElementById('argyle-accounts');accounts.replaceChildren();
    for(const account of data.accounts){const article=document.createElement('article'),title=document.createElement('h3'),status=document.createElement('p'),limits=document.createElement('p');title.textContent=account.name;status.textContent=account.status+' · Provider refresh: '+(account.refreshFrequency||'not confirmed');limits.textContent=account.limitations||'';article.append(title,status,limits);accounts.append(article);}
    const records=document.getElementById('argyle-records');records.replaceChildren();
    for(const record of data.records.slice(0,200)){const row=document.createElement('tr');cell(row,record.platform);cell(row,record.kind+' · '+(record.removedAt?'Removed by provider':record.status||'received'));cell(row,record.kind==='ratings'?'Rating: '+(record.rating??'not supplied')+' / 5':record.kind==='vehicles'?[record.vehicle?.year,record.vehicle?.make,record.vehicle?.model].filter(Boolean).join(' '):record.income?.total==null?null:(record.income.currency||'')+' '+record.income.total);cell(row,record.sourceUpdatedAt);cell(row,record.observedAt);cell(row,record.deliveryDelaySeconds==null?null:record.deliveryDelaySeconds+' seconds');records.append(row);}
    document.getElementById('argyle-record-count').textContent=data.records.length+' received records'+(data.records.length>200?' · newest 200 shown':'');
    if(data.lastError)message(data.lastError);
  }
  document.getElementById('argyle-connect')?.addEventListener('click',async()=>{
    if(busy)return;busy=true;
    try{if(!window.Argyle)throw new Error('The secure provider form did not load. Reload this page to try again.');
      const token=await request('/link',{});link?.close();
      link=window.Argyle.create({userToken:token.userToken,sandbox:token.sandbox,
        onAccountConnected:async()=>{try{await request('/sync',{});message('Account linked. Its available work records will arrive in the background.');await refresh();}catch(error){message(error.message);}},
        onAccountError:()=>message('The provider needs you to check or reconnect this work account.'),
        onTokenExpired:async update=>{try{update((await request('/link',{})).userToken);}catch(error){link?.close();message(error.message);}},
        onClose:()=>refresh().catch(error=>message(error.message))});link.open();
    }catch(error){message(error.message);}finally{busy=false;}
  });
  document.getElementById('argyle-refresh')?.addEventListener('click',async()=>{try{await request('/sync',{});message('An update was queued. Provider timing still applies.');await refresh();}catch(error){message(error.message);}});
  document.getElementById('argyle-disconnect')?.addEventListener('submit',async event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;try{await request('/disconnect',{confirm:true});message('Future account updates are stopped. Imported history is kept.');await refresh();}catch(error){message(error.message);}});
  let timer;
  async function poll(){if(stopped)return;try{await refresh();}catch(error){message(error.message);}if(!stopped)timer=setTimeout(poll,10000);}
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);link?.close();});poll();
})();`;
