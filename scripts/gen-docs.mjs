/**
 * Documentation-site generator (Adobe-style: sidebar + search + article pages).
 * Run:  node scripts/gen-docs.mjs   → writes public/docs/*.html
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "docs");

const CATS = {
  start:"Getting started", money:"Money & books", sales:"Sales & customers",
  team:"Team & payroll", ops:"Operations", connect:"Integrations", build:"Build your own tools",
};

// [slug, title, cat, route, emoji, lead, [steps], [tips]]
const D = [
  ["welcome","Welcome to Shuug","start","/","👋","Shuug is the free back office that runs your business and keeps perfect books. This manual shows you how to use every tool — and how to build your own.",
    ["<b>Open the app</b> and you'll land on your Home cockpit — the day's numbers and what needs attention.","<b>Set up your business</b> so Shuug turns on the right tools (see “Set up your business”).","<b>Connect your apps</b> — Shopify, Stripe, Amazon and more — so sales flow into the books.","<b>Explore the left rail</b>: Money, Sales, Team, Operations, Setup. Only what your business needs is shown."],
    ["Everything is connected to one set of double-entry books, so nothing is entered twice.","Use the search box (top-left of these docs) to jump to any tool."]],
  ["setup-business","Set up your business","start","/setup","🪄","Tell Shuug what you run and it configures the workspace — the right modules, fields and workflows for your trade.",
    ["Go to <b>Setup → Set up from your website</b> (or open <code>/setup</code>).","Search or pick your business type (mechanic, restaurant, swim school, wholesale…).","Answer a few yes/no questions — do you schedule appointments, hold inventory, track staff time?","<b>Preview your workspace</b>, then <b>Save & apply</b>. The left rail updates to your tools."],
    ["You can change your business type or toggle any tool later in Branding → Workspace & tools.","Picking a type turns on real functionality (e.g. authorized-pickup lists for daycare), not just relabeled fields."]],
  ["tour-workspace","Tour your workspace","start","/","🧭","The parts of the app you'll use every day.",
    ["<b>Home cockpit</b> — pinnable widgets with your live numbers.","<b>Needs-attention bar</b> — overdue invoices, low stock, anything that needs you, at the top.","<b>Left rail</b> — your tools, grouped. Rearrange or hide sections with the gear.","<b>Top search</b> — jump to any customer, contact or company."],
    ["Roles control what each teammate sees — see “Roles & permissions”."]],
  ["white-label","Brand your workspace","start","/branding","🎨","Make it yours — name, colors, logo and backgrounds, applied app-wide.",
    ["Open <b>Setup → Branding & workspace</b> (<code>/branding</code>).","Set your business name, tagline and logo (upload an image or pick an emoji).","Choose your brand, accent, background, sidebar and header colors — watch the live preview.","Hit <b>Save & apply workspace</b>. The whole app re-themes for everyone."],
    ["Agencies can white-label Shuug and resell it as their own.","Use “Workspace & tools” on the same page to permanently hide features you never use."]],
  ["invite-team","Add your team & roles","start","/admin","👥","Bring your people in and control what each can see and do.",
    ["Go to <b>Team</b> to add members (name, role, pay rate).","Open <b>Setup → Roles & access</b> (<code>/admin</code>) to set permissions per section.","Give each role a level per area — none, view or edit.","Use “preview as” to see the app exactly as that role does."],
    ["The Owner is always all-powerful and can't be locked out.","Support roles (warehouse, kitchen) can see their work without seeing payroll or financials."]],

  ["general-ledger","The general ledger","money","/ledger","📚","A real double-entry ledger. Sales, payments and expenses post themselves; you can add adjusting entries by hand.",
    ["Open <b>Money → General ledger</b> (<code>/ledger</code>).","Review the <b>journal</b> — auto-posted entries from orders, payments and expenses, newest first.","Check the <b>trial balance</b> — it proves debits equal credits.","To add an adjusting entry, click <b>Manual entry</b>, add balanced lines (it won't post unless debits = credits)."],
    ["The P&L and Balance Sheet are derived from the ledger, so they always tie out.","Every posting shows its source (order, payment, expense or manual)."]],
  ["invoicing","Create & send invoices","money","/collections","🧾","Turn orders into invoices and get paid, with terms, partials and fees handled.",
    ["Open <b>Money → Collections</b> (<code>/collections</code>) to see every invoice and its status.","An order becomes an invoice automatically; due date = order date + your payment terms.","Record a payment (full or partial), note fees or refunds — the balance updates.","Send a reminder or set a promised-to-pay date right from the invoice."],
    ["Aging buckets (current / 1-30 / 31-60 / 61-90 / 90+) show who owes you and how late."]],
  ["collections","Chase & collect payments","money","/collections","⏰","Stay on top of receivables without the awkward.",
    ["From <b>Collections</b>, sort by most overdue.","Send an approved reminder, or log a promise-to-pay with a date.","Escalate a stubborn balance to a person for a call.","Watch the outstanding and collected totals move as you go."],
    ["Set up an automation rule to remind you when an invoice passes 15 days (see “Automation rules”)."]],
  ["expenses","Track expenses & bills","money","/expenses","💸","Record what you spend so your margins and books are right.",
    ["Open <b>Money → Expenses</b> (<code>/expenses</code>).","Add an expense: merchant, date, amount, category, paid or unpaid.","Unpaid bills become accounts payable; paid ones hit cash.","Categories flow into your P&L and true cost of goods."]],
  ["reports","Read your P&L & Balance Sheet","money","/books","📊","The financial statements, straight from the ledger.",
    ["Open <b>Money → Accounting</b> (<code>/books</code>).","Read the <b>Profit & Loss</b>: income, cost of goods, operating expenses, net income.","Switch to the <b>Balance Sheet</b>: assets = liabilities + equity, always.","Check the cost-lowering insights below the P&L."],
    ["Because they're derived from the ledger, the statements can't drift from your books."]],
  ["sales-tax","Handle sales tax","money","/books","🧮","Track what you owe as you sell.",
    ["Open <b>Money → Accounting → Sales tax</b>.","Set your rate (SALES_TAX_RATE_BPS) in settings.","Tax is estimated per taxable sale, by region, and posts to Sales Tax Payable.","Use the summary to prepare a filing."]],
  ["reconciliation","Reconcile the bank","money","/reconcile","🏦","Match your records to the bank — surface mismatches, don't hide them.",
    ["Open <b>Money → Reconcile</b> (<code>/reconcile</code>).","Compare your totals (A/R, income, tax, fees) to the accounting side.","Anything unmatched shows as a variance — and “unknown” when a source isn't connected.","Connect QuickBooks or a bank to fill the accounting side."]],
  ["cash-flow","Forecast cash flow","money","/cashflow","💰","See the crunch before it hits.",
    ["Open <b>Money → Cash flow</b> (<code>/cashflow</code>).","Read the 12-week calendar: expected money in vs bills and payroll out.","Check the lowest projected balance and whether it goes negative.","Run the “collections slip 2 weeks” stress test."]],

  ["crm","Manage customers (CRM)","sales","/pipeline","🤝","Every customer and deal in one place.",
    ["Open <b>Sales → Sales pipeline</b> (<code>/pipeline</code>) for your deal board.","Drag deals across stages; the weighted forecast updates.","Open a customer to see their unified timeline — orders, quotes, messages.","Assign an owner so no one double-replies."]],
  ["quotes","Quotes → orders","sales","/customers","📄","Send a quote, and turn the accepted one into an order without re-typing.",
    ["From a customer's timeline, click <b>New quote</b> and add products.","Send it; track sent / accepted / declined / expired.","When accepted, click <b>Convert to order</b> — it becomes a real order.","The order flows into invoicing and the books."]],
  ["portal","Give customers a portal","sales","/customers","🔐","A clean account view your customer can use.",
    ["Open a customer and click <b>Portal</b>.","They see past orders, receipts, pricing and who their rep is.","Share signed agreements or COIs as downloads.","Share the link — it's read-only and safe."]],
  ["products","Products & pricing","sales","/products","🏷️","Your catalog, with a margin engine and volume tiers.",
    ["Open <b>Sales → Products & pricing</b> (<code>/products</code>).","Set cost and price — see gross profit and margin with a green/amber/red guardrail.","Add volume tiers for bulk pricing.","Per-customer price lists and per-order overrides are supported."]],
  ["documents","Documents & e-sign","sales","/documents","📁","Every license, insurance cert, permit and contract — with renewal reminders and e-sign.",
    ["Open <b>Setup → Documents & legal</b> (<code>/documents</code>).","Upload a PDF or scan and file it by category.","Set an expiration date — Shuug flags it as it nears renewal.","Send a document to sign via DocuSign or PandaDoc (connect first)."]],

  ["time-clock","Clock in & timesheets","team","/timeclock","🕒","Track hours — for hourly and salaried staff — and roll them into payroll.",
    ["Open <b>Team → Time clock</b> (<code>/timeclock</code>).","Clock a person in (optionally against a job or board card), and out.","The weekly timesheet totals regular vs overtime (over 40h at 1.5×) and gross pay.","Fix or add a shift with the manual entry."]],
  ["scheduling","Schedule shifts","team","/timeclock","📅","Plan who works when.",
    ["From <b>Team → Time clock</b>, open scheduling.","Add shifts per person; attendance checks against them.","Hours worked flow to payroll and job costs."]],
  ["payroll","Run payroll","team","/team","💵","Turn hours into pay.",
    ["Open <b>Team</b> and review each member's rate (or salary).","Hours from the time clock roll up with overtime.","Export to your payroll provider (ADP) from Team.","Labor cost feeds your P&L."]],
  ["performance","Performance & ROI","team","/performance","📈","See who's driving results — value vs pay, honestly.",
    ["Open <b>Team → Performance</b> (<code>/performance</code>).","Each person gets a scorecard: revenue attributed, value multiple, ROI.","Support roles are judged on throughput, not revenue, so they're never unfairly “expense”.","Generate a daily or weekly analyst review."]],
  ["permissions","Roles & permissions","team","/admin","🔑","Control who sees and does what.",
    ["Open <b>Setup → Roles & access</b> (<code>/admin</code>).","Set each role's level per section — none, view or edit.","Assign roles to team members.","Preview the app as any role before you save."]],

  ["inventory","Track inventory","ops","/operations","📦","Know what's on hand and never run out.",
    ["Open <b>Operations → Inventory & shipping</b> (<code>/operations</code>).","See on-hand, reorder point and days-of-cover per item.","Low stock is flagged; build a reorder plan with a suggested run.","Shipments decrement stock; receiving adds it back."]],
  ["work-orders","Run work orders","ops","/workorders","⚙️","A guarded lifecycle — estimate → approve → schedule → invoice — where every step has requirements.",
    ["Open <b>Operations → Work orders</b> (<code>/workorders</code>).","Create an order, add an estimate.","Approve it — you must record who approved it (evidence required).","Schedule (needs a free bay/tech), start, complete, then invoice."],
    ["Nothing skips a step by flipping a status; every action is audited and can't double-apply."]],
  ["restaurant","Run a restaurant","ops","/restaurant","🍽️","Reservations and the kitchen line, in one.",
    ["Open <b>Operations → Restaurant</b> (<code>/restaurant</code>).","Take reservations; Shuug suggests a best-fit table and prevents double-books.","Fire tickets to the kitchen board — items move new → cooking → ready.","Watch station load and the oldest ticket."]],
  ["childcare","Run childcare & classes","ops","/childcare","🧸","Attendance, staff ratios, enrollment and tuition.",
    ["Open <b>Operations → Childcare & classes</b> (<code>/childcare</code>).","Sign children in/out with authorized pickups.","Watch the live staff-to-child ratio by age group — it stays compliant.","Enroll into classes (swim, art…) and bill tuition monthly."]],
  ["assessments","Run assessments & inspections","ops","/assessments","📋","The evaluations your trade runs — scored, with a critical-item override.",
    ["Open <b>Operations → Assessments</b> (<code>/assessments</code>).","Pick a template for your trade (vehicle inspection, line check, site-safety audit…).","Score each item; a failed critical item auto-fails the whole thing.","Save it — pass rates and history are kept per inspection type."]],

  ["connecting","Connect your apps (1-2-3)","connect","/integrations","🔌","Hooking up an app is three steps: open its API page, copy your key, paste it here.",
    ["Open <b>Setup → Integrations</b> (<code>/integrations</code>).","Find the app and click <b>+ Add API</b>.","Step ① opens the provider's real API-keys page in a new tab.","Step ② copy your key; step ③ paste it here and connect. It's stored encrypted, fail-closed."],
    ["Direct connectors cover the big ones; Zapier reaches 300+ more.","Nothing is sent to the provider until your credentials verify."]],
  ["shopify-setup","Connect Shopify","connect","/integrations","🛍️","Sync your Shopify store's orders, customers and products.",
    ["In <b>Integrations</b>, click <b>+ Add API</b> on Shopify.","Open the Shopify apps/development page (button provided), create a custom app.","Copy the Admin API access token and your store domain.","Paste them in Settings and test — orders start flowing into the books."]],
  ["stripe-setup","Connect Stripe","connect","/integrations","💳","Take card payments and reconcile payouts.",
    ["In <b>Integrations</b>, click <b>+ Add API</b> on Stripe.","Open your Stripe dashboard API keys page (button provided).","Copy your secret key (and webhook signing secret).","Paste in Settings and test — payments and payouts reconcile against the bank."]],
  ["automations","Automation rules","connect","/automation","🤖","“When this, do that,” across the whole business — no code.",
    ["Open <b>Setup → Automation rules</b> (<code>/automation</code>).","Pick a trigger (invoice overdue, license expiring, low stock, big order, dormant customer).","Set the threshold and the action (notify, create a task, flag).","Turn it on — it's checked against live data and shows what it's firing on."]],

  ["no-code","Build a tracker (no code)","build","/features","🧩","Anyone can add a tool — name it, add fields, start entering records.",
    ["Open <b>Setup → Tools & custom trackers</b> (<code>/features</code>).","Name your tracker and add fields (text, number, money, date, choice, checkbox).","Save — it appears in the nav with a records table.","Add records; view them as a table, board or calendar."]],
  ["module-sdk","Build a module (code)","build","/developer","⌨️","Developers add a full feature from one manifest file — no core edits.",
    ["Create <code>src/modules/your-id.ts</code> and export <code>defineModule({ … })</code> with fields, panels and an optional API.","Add it to <code>src/modules/index.ts</code>.","That's it — you get a nav item, permissions, a records UI at <code>/m/your-id</code> and an API at <code>/api/v1/m/your-id</code>.","See the Developer console (<code>/developer</code>) and <code>docs/MODULES.md</code>."],
    ["The manifest is validated at startup, so a bad module fails fast and loud."]],
  ["state-layer","Understand the state layer","build","/platform","🧬","The engine underneath: one normalized business model that apps and AI act on.",
    ["Open <b>Setup → Business state layer</b> (<code>/platform</code>).","See the ten primitives and how each vertical's nouns map to them.","Browse the capability surface — the one door apps and AI use instead of 40 APIs.","Read <code>docs/STATE_LAYER.md</code> for the full thesis."]],
];

const bySlug = Object.fromEntries(D.map(d=>[d[0],d]));
const esc = s => s.replace(/&(?!amp;|lt;|gt;|#)/g,"&amp;");
const idx = D.map(d=>({slug:d[0],title:d[1],cat:CATS[d[2]],lead:d[6]}));

const SIDEBAR = (active) => Object.keys(CATS).map(c=>{
  const items = D.filter(d=>d[2]===c);
  return `<div class="navgrp"><h6>${CATS[c]}</h6>${items.map(d=>`<a href="/docs/${d[0]}"${d[0]===active?' class="on"':''}>${d[1]}</a>`).join("")}</div>`;
}).join("");

const TOP = `<div class="top"><div class="in">
  <a class="brand" href="/docs"><span class="m">◎</span> Shuug Docs</a>
  <div class="sp"><a class="lnk" href="/welcome">Marketing site</a><a class="open" href="/">Open the app →</a></div>
</div></div>`;

const SEARCH = `<input class="search" id="q" placeholder="🔍 Search the docs…" autocomplete="off"/><div class="results" id="res"></div>`;
const SCRIPT = `<script>window.__DOCS=${JSON.stringify(idx)};
const q=document.getElementById('q'),res=document.getElementById('res');
if(q){q.addEventListener('input',()=>{const v=q.value.trim().toLowerCase();if(!v){res.classList.remove('show');res.innerHTML='';return;}
const hits=window.__DOCS.filter(d=>(d.title+' '+d.lead+' '+d.cat).toLowerCase().includes(v)).slice(0,8);
res.innerHTML=hits.map(d=>'<a href="/docs/'+d.slug+'">'+d.title+'<small>'+d.cat+'</small></a>').join('')||'<a>No matches</a>';res.classList.add('show');});}
(function(){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var pb=document.createElement('div');pb.className='dprogress';document.body.appendChild(pb);
function sc(){var h=document.documentElement,s=h.scrollTop||document.body.scrollTop,m=(h.scrollHeight-h.clientHeight)||1;pb.style.width=(s/m*100)+'%';}
document.addEventListener('scroll',sc,{passive:true});sc();
var els=document.querySelectorAll('.reveal');
if(rm){els.forEach(function(e){e.classList.add('in');});return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var el=e.target;el.classList.add('in');if(el.classList.contains('stagger')){var k=el.children,i;for(i=0;i<k.length;i++){k[i].style.transitionDelay=(i*55)+'ms';}}io.unobserve(el);});},{rootMargin:'0px 0px -6% 0px'});
els.forEach(function(e){io.observe(e);});
document.querySelectorAll('.sp,.shot').forEach(function(el){el.classList.add('zoomable');});
var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<div class="lb-card"><button class="lb-x" aria-label="Close">✕</button><div class="lb-in"></div></div>';document.body.appendChild(lb);
var inn=lb.querySelector('.lb-in');
function lbO(el){inn.innerHTML=el.innerHTML;lb.classList.add('on');document.body.style.overflow='hidden';}
function lbC(){lb.classList.remove('on');document.body.style.overflow='';}
document.addEventListener('click',function(e){var z=e.target.closest('.zoomable');if(z&&!e.target.closest('a,button')){lbO(z);}});
lb.addEventListener('click',function(e){if(e.target===lb||e.target.closest('.lb-x'))lbC();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')lbC();});
})();
</script>`;

function head(title,desc,slug){return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)} | Shuug Docs</title><meta name="description" content="${esc(desc)}"/><link rel="canonical" href="https://shuug.co/docs/${slug}"/><link rel="stylesheet" href="/docs/docs.css"/></head><body>${TOP}<div class="shell"><aside class="side">${SEARCH}${SIDEBAR(slug)}</aside><main class="main">`;}
const tail = `</main></div>${SCRIPT}</body></html>`;

function article(d,i){
  const [slug,title,cat,route,emoji,lead,steps,tips=[]]=d;
  const rel = D.filter(x=>x[2]===cat&&x[0]!==slug).slice(0,4);
  const prev=D[i-1], next=D[i+1];
  return head(title, lead, slug)+`
  <div class="crumb"><a href="/docs">Docs</a> › ${esc(CATS[cat])}</div>
  <article class="article">
    <h1>${emoji} ${esc(title)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="shot reveal"><div class="cap"><i></i><i></i><i></i><b>shuug ${route}</b></div><div class="body"><div><div class="big">${emoji}</div>Screenshot of ${esc(title)} — <a href="${route}">open it in the app →</a></div></div></div>
    <h2>How to use it</h2>
    <ol class="steps reveal stagger">${steps.map(s=>`<li>${s}</li>`).join("")}</ol>
    ${tips.length?`<h2>Tips</h2>${tips.map(t=>`<div class="tip"><b>Tip.</b> ${esc(t)}</div>`).join("")}`:""}
    <h2>Related</h2>
    <div class="related">${rel.map(r=>`<a href="/docs/${r[0]}">${r[4]} ${r[1]}<small>${esc(CATS[r[2]])}</small></a>`).join("")}</div>
    <div class="pagenav">${prev?`<a href="/docs/${prev[0]}"><small>Previous</small>${prev[1]}</a>`:"<span></span>"}${next?`<a href="/docs/${next[0]}" style="text-align:right"><small>Next</small>${next[1]}</a>`:"<span></span>"}</div>
  </article>`+tail;
}

function home(){
  const cards = D.slice(0,12).map(d=>`<a class="dcard" href="/docs/${d[0]}"><div class="e">${d[4]}</div><h3>${d[1]}</h3><p>${esc(d[5]).slice(0,90)}…</p></a>`).join("");
  return head("Documentation & operating manual","How to run your entire business in Shuug from one dashboard — operations, bookkeeping, AI employees, workflows, business intelligence, the module SDK and white-label. Step-by-step guides, 1000% free and 100% customizable.","")+`
  <div class="dhero"><h1>Shuug operating manual</h1><p>The full business suite in one dashboard — operations, bookkeeping, AI employees, workflows and business intelligence, all in one place. This manual shows you how to run every part of it, and how to build your own tools on top. 1000% free, 100% customizable, built around you. Search above, or start with the basics.</p></div>
  <div class="suitegrid reveal stagger">
    <div class="sp"><b>🏃 Business operations</b><span>Orders, inventory, scheduling, jobs</span></div>
    <div class="sp"><b>📚 Bookkeeping</b><span>Real double-entry, keeps itself</span></div>
    <div class="sp"><b>🤖 AI employees</b><span>Handlers that do the busywork</span></div>
    <div class="sp"><b>⚡ Workflows</b><span>When this happens, do that</span></div>
    <div class="sp"><b>📊 Business intelligence</b><span>Every number, one live dashboard</span></div>
    <div class="sp"><b>🧩 Build your own</b><span>Module SDK &amp; no-code trackers</span></div>
    <div class="sp"><b>🏷️ White-label</b><span>Your brand, free to reuse</span></div>
    <div class="sp"><b>🔌 300+ integrations</b><span>Everything funnels to one place</span></div>
  </div>
  <h2 style="margin:34px 0 12px;font-size:22px">Start here</h2>
  <div class="cards reveal stagger">${cards}</div>
  <h2 style="margin:38px 0 12px;font-size:20px">Everything, by area</h2>
  ${Object.keys(CATS).map(c=>`<div style="margin:16px 0"><h3 style="font-size:15px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-size:12px">${CATS[c]}</h3><div class="related">${D.filter(d=>d[2]===c).map(d=>`<a href="/docs/${d[0]}">${d[4]} ${d[1]}<small>${esc(d[5]).slice(0,60)}…</small></a>`).join("")}</div></div>`).join("")}
  `+tail;
}

mkdirSync(OUT,{recursive:true});
writeFileSync(path.join(OUT,"index.html"), home());
D.forEach((d,i)=>writeFileSync(path.join(OUT,`${d[0]}.html`), article(d,i)));
console.log(`generated docs home + ${D.length} articles → ${OUT}`);
