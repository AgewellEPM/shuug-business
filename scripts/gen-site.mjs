/**
 * Static marketing-site generator. One data model → 50 pixel-art pages (45 industries
 * + 5 topics) + 2 hub grids + sitemap, fully interlinked (pyramid SEO). Run:
 *   node scripts/gen-site.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "site");
const BASE = "https://shuug.co"; // change to your domain for the sitemap

const TOOLS = {
  channel:["Channel sync","Orders, customers & products flow in"],
  stock:["Inventory","Levels, reorder, days-of-cover"],
  pricing:["Products & pricing","Margin engine, volume tiers"],
  inv:["Invoicing & collections","Get paid: aging, reminders, promises"],
  books:["Real double-entry books","Every sale posts itself; always ties out"],
  tax:["Sales tax","By region, tracked automatically"],
  exp:["Expenses & bills","Categorized, A/P, true COGS"],
  pnl:["P&L & Balance Sheet","Derived from the ledger, always balance"],
  recon:["Reconciliation","Payouts & deposits vs the bank"],
  crm:["CRM & client records","One record per customer"],
  mkt:["Marketing & ROAS","Ads, campaigns, results"],
  integ:["300+ integrations","Shopify, Amazon, Stripe, Zapier…"],
  pos:["Point of sale","Ring up sales in person"],
  pay:["Payroll","Hours & overtime → pay"],
  time:["Time clock & scheduling","Shifts, hours by job"],
  cash:["Cash-flow forecast","12-week runway"],
  resv:["Reservations & tables","Seat without double-books"],
  kds:["Kitchen board","Run the line"],
  menu:["Menu & recipes","Cost every plate"],
  prod:["Production & costing","True cost per unit"],
  assess:["Inspections & checklists","Scored, on the record"],
  appt:["Appointments & booking","Online scheduling"],
  wo:["Work orders","Estimate → approve → invoice"],
  vehicles:["Customers & vehicles","Full service history"],
  docs:["Documents & e-sign","Contracts, approvals, renewals"],
  jobs:["Jobs & projects","Milestones & profitability"],
  photos:["Field photos & sign-off","Proof of work"],
  profit:["Job profitability","Estimated vs actual"],
  routes:["Routes & dispatch","Coverage & delivery"],
  memberships:["Memberships","Recurring plans & renewals"],
  classes:["Classes & lessons","Enrollment, levels, attendance"],
  ratios:["Attendance & ratios","Sign-in, pickups, compliance"],
  tuition:["Tuition & fee billing","Recurring, never double-billed"],
  portal:["Client / parent portal","Orders, receipts, updates"],
  donations:["Donations & fund accounting","Gifts kept separate"],
  programs:["Programs & outcomes","Evidence & reports"],
  volunteers:["Volunteers & shifts","Verified hours"],
  pets:["Pet & owner records","Vaccinations, notes"],
  white:["White-label","Your brand, own it, move it"],
};

// Rich per-tool detail shown when a tool card is opened.
// {what: does, how: works, ai: how a Handler/AI runs it, why: why it matters}
const DETAIL = {
  channel:{what:"Pulls orders, customers and products from Shopify, Amazon, eBay and your POS into one place.",how:"Connect a store once; new orders flow in every few minutes and update stock and the books.",ai:"A Handler watches for new orders, flags problems, and answers “where’s my order” without you touching it.",why:"Stop re-keying orders between apps — one list, every channel, always current."},
  stock:{what:"Live stock levels, reorder points and days-of-cover across every location and channel.",how:"Every sale, return and delivery adjusts counts automatically; low items surface before you run out.",ai:"A Handler watches levels and drafts purchase orders so you never run out of a bestseller.",why:"Never oversell or dead-stock your cash — know exactly what to reorder and when."},
  pricing:{what:"One product catalog with cost, margin and volume/tier pricing built in.",how:"Set cost and price once; the cents-precise margin engine shows real profit on every line.",ai:"Ask AI to model a price change and see the margin impact before you commit.",why:"Price with confidence — know your true margin on every item and customer."},
  inv:{what:"Send invoices, track aging, chase what’s owed and record every payment.",how:"Create from an order or job; partials, deposits, fees and refunds all handled and posted.",ai:"A Handler sends reminders on the right day and answers “what do I owe” for you.",why:"Get paid faster — nothing slips through, no awkward chasing."},
  books:{what:"A true general ledger — debits, credits and reports that always balance.",how:"Every sale, bill and payment posts a balanced entry automatically; no manual journals.",ai:"AI can categorize transactions and explain any number back to its source.",why:"Real accounting, not a spreadsheet — your books are audit-ready, always."},
  tax:{what:"Sales tax tracked by region on every sale, ready to file.",how:"Rules per region apply at checkout and post to the ledger; a running total shows what’s owed.",ai:"Ask “how much tax do I owe this quarter” and get the number from real entries.",why:"No surprises at filing time — the tax is set aside and tracked as you go."},
  exp:{what:"Track bills, categorize spending and capture true cost of goods.",how:"Enter or import bills, assign categories and pay — A/P and COGS post themselves.",ai:"A Handler reads a bill, suggests the category and flags anything unusual.",why:"See where the money actually goes and get COGS right for true profit."},
  pnl:{what:"Profit & loss, balance sheet and cash flow, derived straight from the ledger.",how:"Nothing to build — reports read the same entries your sales created and always tie out.",ai:"Ask AI “how did we do last month” and get a plain-English read of the numbers.",why:"Know if you’re actually making money — instantly, not at tax time."},
  recon:{what:"Match payouts and deposits to the bank so your books match reality.",how:"Import a statement; Shuug matches deposits to sales and flags anything off.",ai:"AI proposes matches and explains the leftovers so reconciling takes minutes.",why:"Catch missing money and errors before they compound."},
  crm:{what:"One record per customer — contact, history, jobs, invoices and notes.",how:"Every order, appointment and payment attaches to the customer automatically.",ai:"A Handler answers customer questions and surfaces who to follow up with.",why:"Know every customer’s full story in one place — no more scattered notes."},
  mkt:{what:"Track campaigns, ad spend and return on ad spend against real sales.",how:"Connect ad accounts; spend and results line up next to the revenue they drove.",ai:"Ask AI which campaign actually made money and where to put the next dollar.",why:"Stop guessing — spend where it pays back."},
  integ:{what:"Connect Shopify, Amazon, Stripe, Zapier, Slack and hundreds more.",how:"Pick a service, open its real API page, paste the key — connected in three steps.",ai:"Handlers act across connected apps — message Slack, update a sheet, send an email.",why:"Shuug plugs into what you already use instead of replacing it."},
  pos:{what:"Ring up in-person sales that post to stock and the books instantly.",how:"Tap items, take payment; inventory and the ledger update in the same second.",ai:"AI can pull the day’s takings and flag a register that doesn’t balance.",why:"In-person and online finally live in one set of books."},
  pay:{what:"Turn hours and overtime into pay, with the right deductions.",how:"Approved timesheets flow into a pay run; net pay and taxes post to the books.",ai:"A Handler preps the pay run and flags anyone with odd hours to review.",why:"Pay your crew right and on time without a separate payroll app."},
  time:{what:"Clock-in/out, shifts and hours tracked by job or department.",how:"Staff clock in on any device; hours roll into scheduling, job cost and payroll.",ai:"A Handler builds next week’s schedule and warns about overtime before it happens.",why:"Know who’s on, what it costs and pay from real hours — not guesses."},
  cash:{what:"A rolling 12-week view of money in vs money out.",how:"Open invoices, bills and payroll project forward so you see the runway.",ai:"Ask AI “can I afford this hire” and see the effect on cash.",why:"See a cash crunch weeks early, while you can still act."},
  resv:{what:"Take bookings and seat guests without double-booking a table.",how:"Online and phone reservations land on one floor plan with turn times.",ai:"An AI host answers, books and confirms reservations while you run service.",why:"Fill more covers with fewer no-shows and zero clashes."},
  kds:{what:"A live kitchen display that runs the line ticket by ticket.",how:"Orders hit the board by station; bump them as they go out, timed and tracked.",ai:"AI flags a slow ticket and re-times the board when the rush hits.",why:"Faster tickets, fewer mistakes, a calmer line."},
  menu:{what:"Build menus, cost every recipe and update prices everywhere at once.",how:"Set ingredients and portions; food cost and margin calculate per plate.",ai:"Ask AI which dishes make money and which to re-price or cut.",why:"Know the true cost of every plate before it eats your margin."},
  prod:{what:"Track what you make and the true cost per unit.",how:"Recipes/BOMs and labor roll into a real per-unit cost that feeds pricing and books.",ai:"AI flags when a unit’s cost drifts so you re-price before you lose money.",why:"Price and produce from real costs, not gut feel."},
  assess:{what:"Scored checklists and inspections kept on the record.",how:"Run a checklist on any device; results attach to the job, site or shift.",ai:"A Handler chases missing checklists and flags failed items to fix.",why:"Prove the work was done right — and catch what wasn’t."},
  appt:{what:"Online scheduling customers can book themselves.",how:"Share a booking link; slots respect staff, resources and travel time.",ai:"An AI receptionist books, reschedules and reminds so the phone stops ringing.",why:"Fill the calendar without playing phone tag."},
  wo:{what:"Estimate → approve → do the work → invoice, in one thread.",how:"Build an estimate, get approval, log parts and labor, turn it into an invoice.",ai:"A Handler drafts the estimate and nudges the customer to approve.",why:"Nothing done for free — every job priced, approved and billed."},
  vehicles:{what:"Full service history per vehicle and owner.",how:"Every work order, part and note attaches to the vehicle for next time.",ai:"AI surfaces due services and drafts the reminder to bring it in.",why:"Win repeat work by knowing each car’s history cold."},
  docs:{what:"Contracts, approvals and renewals sent and signed online.",how:"Send a doc, collect a signature, store it on the customer or job.",ai:"A Handler chases unsigned docs and files signed ones automatically.",why:"Get approvals in writing without the paper chase."},
  jobs:{what:"Multi-step jobs with milestones, costs and profitability.",how:"Track labor, parts and progress against the estimate as the job runs.",ai:"AI flags a job going over budget while you can still fix it.",why:"See which jobs actually made money — not just which got done."},
  photos:{what:"Before/after photos and customer sign-off from the field.",how:"Snap photos on-site; they attach to the job as proof of work.",ai:"AI assembles the photo record and warns if sign-off is missing.",why:"End disputes with proof, and get paid on completion."},
  profit:{what:"Estimated vs actual profit on every job.",how:"Real labor, parts and costs stack against the estimate automatically.",ai:"Ask AI which job types and crews are actually profitable.",why:"Bid smarter next time using what really happened last time."},
  routes:{what:"Plan routes and dispatch crews for the day’s coverage.",how:"Jobs and deliveries sort into efficient routes with live status.",ai:"A Handler re-routes around a cancellation or delay in real time.",why:"More stops, less drive time, on-time every day."},
  memberships:{what:"Recurring plans, renewals and member perks.",how:"Set a plan; billing recurs, renewals remind and revenue posts to the books.",ai:"A Handler wins back lapsing members before they churn.",why:"Predictable recurring revenue that runs itself."},
  classes:{what:"Enrollment, levels and attendance for classes and lessons.",how:"Students enroll by level; attendance and make-ups track per session.",ai:"A Handler fills open spots and reminds families about class.",why:"Keep classes full and attendance on the record."},
  ratios:{what:"Sign-in/out, pickups and staff-to-child ratios kept compliant.",how:"Check kids in/out on any device; ratios flag the moment they’re off.",ai:"A Handler alerts you before a ratio breaks and logs the record for licensing.",why:"Stay compliant and keep kids safe — provably."},
  tuition:{what:"Recurring tuition and fees that never double-bill.",how:"Set a schedule per family; charges recur, post to the books and reconcile.",ai:"A Handler chases late tuition gently and answers balance questions.",why:"Predictable income without the billing headaches."},
  portal:{what:"A branded portal for orders, receipts, forms and updates.",how:"Customers log in to pay, sign and see their history — your brand on top.",ai:"A Handler answers portal questions and nudges unpaid balances.",why:"Fewer “can you resend that” calls; customers self-serve."},
  donations:{what:"Gifts and grants tracked with funds kept properly separate.",how:"Restricted and unrestricted funds post to the right place automatically.",ai:"AI drafts donor acknowledgements and fund reports.",why:"Stay accountable to donors and audit-ready."},
  programs:{what:"Track program delivery and the outcomes you report on.",how:"Log activities and results against each program and grant.",ai:"AI assembles the outcome report from what you logged.",why:"Prove impact to funders without a week of spreadsheets."},
  volunteers:{what:"Schedule volunteers and log verified hours.",how:"Volunteers sign up for shifts; hours track and total for reporting.",ai:"A Handler fills empty shifts and thanks volunteers automatically.",why:"Cover every shift and prove volunteer impact."},
  pets:{what:"Pet profiles with vaccinations, notes and owner history.",how:"Every visit, groom and note attaches to the pet and owner.",ai:"AI flags due vaccinations and drafts the reminder.",why:"Safer care and repeat visits from knowing each pet."},
  white:{what:"Your brand on the whole system — own it and move it.",how:"Set your logo, colors and domain; export your data anytime.",ai:"AI helps set up and migrate without lock-in.",why:"It’s your business and your data — never held hostage."},
};

const CATS = {
  online:"Online & retail", food:"Food & drink", auto:"Automotive", trades:"Home & trades",
  beauty:"Beauty & personal care", fitness:"Fitness & wellness", education:"Education & classes",
  care:"Childcare & pet care", wholesale:"Wholesale & making", pro:"Professional services",
  nonprofit:"Community & nonprofit", topic:"By the numbers",
};

// [slug, name, emoji, cat, [tools]]
const B = [
  ["shopify","Shopify store","🛍️","online",["channel","stock","pricing","inv","books","tax","exp","pnl","recon","crm","mkt","integ"]],
  ["amazon","Amazon business","📦","online",["channel","stock","books","tax","cash","exp","mkt","recon","pnl","pricing","integ"]],
  ["etsy","Etsy shop","🧶","online",["channel","stock","books","tax","exp","pnl","mkt","integ","crm"]],
  ["ebay","eBay business","🏷️","online",["channel","stock","books","tax","exp","recon","pnl","integ"]],
  ["woocommerce","WooCommerce store","🛒","online",["channel","stock","books","tax","exp","pnl","mkt","integ"]],
  ["retail","Retail shop","🏬","online",["pos","stock","books","tax","inv","crm","pay","time","pnl","mkt"]],
  ["restaurant","Restaurant","🍽️","food",["resv","kds","menu","stock","time","pay","books","tax","inv","assess"]],
  ["cafe","Cafe / coffee shop","☕","food",["pos","menu","stock","time","pay","books","tax","mkt"]],
  ["bar","Bar / pub","🍺","food",["pos","menu","stock","time","pay","books","tax","assess"]],
  ["bakery","Bakery","🥐","food",["pos","menu","prod","stock","time","pay","books","tax","inv"]],
  ["food-truck","Food truck","🚚","food",["pos","menu","stock","time","books","tax","mkt","cash"]],
  ["catering","Catering","🍱","food",["inv","menu","prod","stock","time","pay","books","tax","crm","docs"]],
  ["auto-repair","Auto repair shop","🔧","auto",["wo","vehicles","stock","assess","inv","time","pay","books","docs","appt"]],
  ["detailing","Auto detailing","🚗","auto",["appt","wo","crm","inv","time","pay","books","mkt"]],
  ["tire-shop","Tire shop","🛞","auto",["wo","stock","inv","pos","time","books","tax","appt"]],
  ["hvac","HVAC company","❄️","trades",["wo","appt","stock","time","docs","inv","jobs","assess","pay","books"]],
  ["plumbing","Plumbing","🚰","trades",["wo","appt","time","docs","inv","jobs","photos","pay","books"]],
  ["electrician","Electrician","⚡","trades",["wo","appt","time","docs","inv","jobs","assess","pay","books"]],
  ["landscaping","Landscaping","🌿","trades",["appt","routes","time","stock","inv","crm","photos","pay","books"]],
  ["cleaning","Cleaning service","🧽","trades",["appt","routes","time","crm","inv","pay","books","mkt"]],
  ["construction","Construction","🏗️","trades",["jobs","wo","docs","time","stock","inv","assess","pay","books","profit"]],
  ["handyman","Handyman","🛠️","trades",["wo","appt","time","inv","docs","pay","books","photos"]],
  ["salon","Hair salon","💇","beauty",["appt","crm","stock","inv","pos","time","pay","books","tax","mkt"]],
  ["barbershop","Barbershop","💈","beauty",["appt","crm","pos","time","pay","books","tax","mkt"]],
  ["spa","Spa","🧖","beauty",["appt","crm","stock","inv","pos","time","pay","books","memberships","mkt"]],
  ["nail-salon","Nail salon","💅","beauty",["appt","crm","stock","pos","time","pay","books","tax"]],
  ["tattoo","Tattoo studio","🖊️","beauty",["appt","crm","docs","stock","inv","pos","time","books","tax"]],
  ["gym","Gym","🏋️","fitness",["memberships","appt","crm","time","pay","books","pos","mkt","assess"]],
  ["yoga","Yoga studio","🧘","fitness",["classes","memberships","appt","crm","pay","books","mkt"]],
  ["dance","Dance studio","🩰","fitness",["classes","tuition","appt","crm","pay","books","assess","portal"]],
  ["swim-school","Swim school","🏊","education",["classes","ratios","tuition","appt","assess","portal","pay","books"]],
  ["music-school","Music school","🎵","education",["classes","tuition","appt","crm","assess","portal","pay","books"]],
  ["art-classes","Art classes","🎨","education",["classes","tuition","appt","crm","portal","pay","books","mkt"]],
  ["tutoring","Tutoring","📚","education",["classes","tuition","appt","crm","assess","portal","pay","books"]],
  ["daycare","Daycare","🧸","care",["ratios","tuition","classes","time","assess","docs","portal","pay","books"]],
  ["preschool","Preschool","🏫","care",["ratios","tuition","classes","programs","docs","portal","pay","books"]],
  ["pet-grooming","Pet grooming","🐩","care",["appt","pets","crm","pos","inv","time","pay","books"]],
  ["vet","Veterinary clinic","🐾","care",["appt","pets","crm","stock","inv","docs","pay","books"]],
  ["wholesale","Wholesale distributor","🏭","wholesale",["pricing","stock","prod","routes","inv","recon","books","crm","channel","integ"]],
  ["manufacturing","Manufacturer","⚙️","wholesale",["prod","stock","wo","inv","pricing","books","pay","time","exp"]],
  ["photography","Photography","📷","pro",["appt","crm","docs","inv","books","tax","portal","mkt"]],
  ["real-estate","Real estate","🏠","pro",["crm","docs","appt","inv","books","mkt","pay"]],
  ["coworking","Coworking space","🏢","pro",["memberships","appt","crm","inv","books","tax","pos"]],
  ["nonprofit","Nonprofit","💜","nonprofit",["donations","programs","volunteers","docs","pay","time","crm","pnl"]],
  ["church","Church / ministry","⛪","nonprofit",["donations","programs","volunteers","docs","crm","pay","books"]],
  // topic pages
  ["bookkeeping","Free bookkeeping","📚","topic",["books","pnl","tax","recon","inv","integ"]],
  ["inventory","Inventory management","📦","topic",["stock","prod","recon","books","integ","pricing"]],
  ["payroll","Payroll & time tracking","🕒","topic",["time","pay","assess","books","docs"]],
  ["invoicing","Invoicing & getting paid","💳","topic",["inv","recon","cash","books","docs","crm"]],
  ["crm","CRM & customers","🤝","topic",["crm","portal","docs","mkt","inv","books"]],
];

const bySlug = Object.fromEntries(B.map(b=>[b[0],b]));
const POPULAR = ["shopify","amazon","restaurant","auto-repair","bookkeeping","wholesale"];
const art = s => (/^[aeiouAEIOU]/.test(s)||/^(HVAC|SEO|MBA)/.test(s)) ? "an" : "a";
const esc = s => s.replace(/&/g,"&amp;");

const MEGA = `<div class="mega"><span class="mtrigger">Features ▾</span><div class="megapanel">
  <a class="mi" href="/welcome/bookkeeping"><span class="ic">📚</span><span class="tx"><b>Bookkeeping</b><small>Real double-entry, keeps itself</small></span></a>
  <a class="mi" href="/welcome/task-management"><span class="ic">✅</span><span class="tx"><b>Task management</b><small>Boards, jobs &amp; to-dos</small></span></a>
  <a class="mi" href="/welcome/ai-employees"><span class="ic">🤖</span><span class="tx"><b>AI building</b><small>Build AI employees &amp; Handlers</small></span></a>
  <a class="mi" href="/welcome/workflows"><span class="ic">⚡</span><span class="tx"><b>Flow</b><small>Workflows &amp; automation</small></span></a>
  <a class="mi" href="/welcome/road-mapping"><span class="ic">🧭</span><span class="tx"><b>Road mapping</b><small>Plan work, map the week</small></span></a>
  <a class="mi" href="/welcome/business-intelligence"><span class="ic">📊</span><span class="tx"><b>Business intelligence</b><small>Every number, one dashboard</small></span></a>
  <a class="mi" href="/welcome/staff-payroll"><span class="ic">🕒</span><span class="tx"><b>Staff &amp; payroll</b><small>Time, shifts &amp; pay</small></span></a>
  <a class="mi" href="/welcome/features"><span class="ic">🔌</span><span class="tx"><b>Integrations</b><small>Connect 300+ apps</small></span></a>
  <a class="mi" href="/welcome/builders"><span class="ic">🧩</span><span class="tx"><b>Builders / MCP</b><small>Open core for developers</small></span></a>
</div></div>`;
const NAV = active => `<nav class="nav"><div class="wrap">
  <a class="brand" href="/welcome"><span class="m">◎</span> Shuug</a>
  <div class="nlinks">${MEGA}<a href="/welcome/platform"${active==='how'?' class="on"':''}>How it works</a><a href="/welcome/industries"${active==='ind'?' class="on"':''}>Industries</a><a href="/welcome/features"${active==='sol'?' class="on"':''}>Solutions</a><a href="/welcome/builders"${active==='build'?' class="on"':''}>Builders</a></div>
  <div class="right"><a class="ghchip" href="https://github.com/AgewellEPM/shuug-business" target="_blank" rel="noopener">★ Open source</a><a class="btn btn-hot" href="/">Open the app →</a></div>
</div></nav>`;

const FOOTER = (b) => {
  const sib = b ? B.filter(x=>x[3]===b[3]&&x[0]!==b[0]).slice(0,5) : [];
  const sibLinks = sib.length ? `<div><h6>${esc(CATS[b[3]])}</h6>${sib.map(s=>`<a href="/welcome/${s[0]}">${s[1]}</a>`).join("")}</div>` :
    `<div><h6>Popular</h6>${POPULAR.map(s=>`<a href="/welcome/${s}">${bySlug[s][1]}</a>`).join("")}</div>`;
  return `<footer><div class="wrap"><div class="fcols">
    <div><div class="brand" style="font-size:13px"><span class="m" style="width:26px;height:26px;font-size:13px">◎</span> Shuug</div><p class="mut" style="max-width:320px;font-size:13px;margin-top:12px">The first fully open-source business platform. MIT-licensed — own it, host it, move it, resell it.</p><span class="badge" style="margin-top:12px">★ Open source · MIT</span></div>
    <div><h6>Explore</h6><a href="/welcome">Home</a><a href="/welcome/platform">How it works</a><a href="/welcome/industries">Industries</a><a href="/welcome/features">Solutions</a></div>
    ${sibLinks}
    <div><h6>Get started</h6><a href="/">Open the app</a><a href="/welcome/bookkeeping">Free bookkeeping</a><a href="https://github.com/AgewellEPM/shuug-business" target="_blank" rel="noopener">★ Code on GitHub</a></div>
  </div></div></footer>`;
};

const HEAD = (title,desc,kw,slug) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<meta name="keywords" content="${esc(kw)}"/>
<link rel="canonical" href="${BASE}/welcome/${slug}"/>
<link rel="stylesheet" href="/site/site.css"/></head><body><div class="aura"></div><div class="content">`;
const MOTION = `<script>(function(){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var pb=document.createElement('div');pb.className='progress';document.body.appendChild(pb);
var nav=document.querySelector('.nav');
function sc(){var h=document.documentElement,s=h.scrollTop||document.body.scrollTop,m=(h.scrollHeight-h.clientHeight)||1;pb.style.width=(s/m*100)+'%';if(nav)nav.classList.toggle('scrolled',s>8);}
document.addEventListener('scroll',sc,{passive:true});sc();
if(rm){document.querySelectorAll('.rv,.stagger').forEach(function(e){e.classList.add('in');});return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var el=e.target;el.classList.add('in');if(el.classList.contains('stagger')){var k=el.children,i;for(i=0;i<k.length;i++){k[i].style.transitionDelay=(i*60)+'ms';}}io.unobserve(el);});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv,.stagger').forEach(function(e){io.observe(e);});
function cu(el){var m=el.textContent.match(/^(\\D*)(\\d[\\d,]*)(.*)$/);if(!m)return;var pre=m[1],n=parseInt(m[2].replace(/,/g,''),10),suf=m[3],t0=null;function st(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/1100,1),e=1-Math.pow(1-p,3);el.textContent=pre+Math.round(n*e).toLocaleString()+suf;if(p<1)requestAnimationFrame(st);}requestAnimationFrame(st);}
var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){cu(e.target);cio.unobserve(e.target);}});},{rootMargin:'0px 0px -4% 0px'});
document.querySelectorAll('.hstats b,.cnum b').forEach(function(e){cio.observe(e);});
var art=document.querySelector('.heroart');
if(art){window.addEventListener('pointermove',function(ev){var x=(ev.clientX/innerWidth-.5),y=(ev.clientY/innerHeight-.5);art.style.transform='translate('+(x*14)+'px,'+(y*12)+'px)';},{passive:true});}
document.querySelectorAll('.btn-hot').forEach(function(b){b.addEventListener('pointermove',function(ev){var r=b.getBoundingClientRect();b.style.transform='translate('+(((ev.clientX-r.left-r.width/2)/r.width)*8-3)+'px,'+(((ev.clientY-r.top-r.height/2)/r.height)*8-3)+'px)';});b.addEventListener('pointerleave',function(){b.style.transform='';});});
document.querySelectorAll('.layer,.fx.fxstatic,.mk,.pl,.sp').forEach(function(el){el.classList.add('zoomable');});
var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<div class="lb-card"><button class="lb-x" aria-label="Close">✕</button><div class="lb-in"></div></div>';document.body.appendChild(lb);
var inn=lb.querySelector('.lb-in');
function lbO(el){inn.innerHTML=el.innerHTML;lb.classList.add('on');document.body.style.overflow='hidden';}
function lbC(){lb.classList.remove('on');document.body.style.overflow='';}
document.addEventListener('click',function(e){var z=e.target.closest('.zoomable');if(z&&!e.target.closest('a,button,summary')){lbO(z);}});
lb.addEventListener('click',function(e){if(e.target===lb||e.target.closest('.lb-x'))lbC();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')lbC();});
})();</script>`;
const TAIL = `</div>`+MOTION+`</body></html>`;

const row = (label,val,cls="") => val ? `<div class="fxrow ${cls}"><b>${label}</b><span>${esc(val)}</span></div>` : "";
const toolCards = keys => keys.map(k=>{
  const t=TOOLS[k], d=DETAIL[k]||{};
  return `<details class="fx"><summary><h5>${esc(t[0])} <span class="tag2 t-live">live</span></h5><p>${esc(t[1])}</p><span class="fxmore">▸ What it does · how it works · how AI runs it</span></summary>
    <div class="fxbody">
      ${row("What it does",d.what)}
      ${row("How it works",d.how)}
      ${row("How AI runs it",d.ai,"ai")}
      ${row("Why it matters",d.why)}
      <a class="fxcta" href="/">Open ${esc(t[0])} in the app →</a>
    </div></details>`;
}).join("");

// --- per-industry workflow graph: bucket the industry's real tools into stages ---
const STAGE = {
  channel:0, resv:0, appt:0, pos:0, portal:0, memberships:0, classes:0, crm:0, mkt:0,
  stock:1, pricing:1, menu:1, prod:1, kds:1, wo:1, vehicles:1, jobs:1, routes:1, photos:1, assess:1, ratios:1, pets:1, programs:1, volunteers:1, docs:1,
  time:2, pay:2,
  inv:3, tax:3, recon:3, cash:3, tuition:3, donations:3,
  books:4, pnl:4, exp:4, profit:4, integ:4, white:4,
};
const STAGE_META = [
  ["Book &amp; intake","take the work in"],
  ["Do the work","run the day-to-day"],
  ["Your crew","hours &amp; pay"],
  ["Get paid","money in"],
  ["The books","it posts itself"],
];
function flowGraph(tools){
  const active = STAGE_META.map((m,i)=>({m,items:tools.filter(k=>STAGE[k]===i)})).filter(g=>g.items.length);
  return `<div class="wgraph rv">`+active.map((g,idx)=>
    `<div class="wstage"><b>${g.m[0]}</b><span>${g.m[1]}</span><div class="wchips">${g.items.map(k=>`<div class="wc">${esc(TOOLS[k][0])}</div>`).join("")}</div></div>`+
    (idx<active.length-1?`<div class="warrow">→</div>`:``)
  ).join("")+`</div>`;
}
function overviewText(b){
  const [,name,,,tools]=b;
  const t0=TOOLS[tools[0]][0].toLowerCase(), t1=TOOLS[tools[1]][0].toLowerCase(), t2=(TOOLS[tools[2]]?.[0]||"the books").toLowerCase();
  return `Running ${art(name)} ${esc(name)} means keeping ${esc(t0)}, ${esc(t1)} and ${esc(t2)} moving while the money and the books keep up behind them. Most owners stitch that together from a booking app, a spreadsheet, a card reader and a shoebox of receipts — then pay a bookkeeper to reconcile the mess at year end. <b>Shuug replaces the whole stack.</b> It's one free, open-source system where every part of your ${esc(name.toLowerCase())} — from the first booking to the final ledger entry — lives in one place and prices itself. No per-seat fees, no paywalled features, no data lost between apps, and real double-entry books that keep themselves as you work.`;
}
function faqFor(b){
  const [,name,,,tools]=b;
  const t1=TOOLS[tools[1]][0].toLowerCase(), first=TOOLS[tools[0]][0];
  const n=name.toLowerCase();
  return [
    [`Is Shuug really free for ${n}s?`, `Yes — the software is 1000% free and open source (MIT-licensed). There are no per-seat fees and no locked "pro" tier; you only pay for hosting and any help importing old data. You can even self-host it yourself for free.`],
    [`Do I need accounting knowledge to run the books?`, `No. Every sale, ${esc(t1)} and expense posts to real double-entry books automatically, so your P&amp;L, balance sheet and sales tax are always right. You run the ${n}; the bookkeeping keeps itself.`],
    [`Can it replace my current ${first.toLowerCase()} tool?`, `Yes — ${esc(first)} is built in and wired to everything else, so there's nothing to sync. It also connects to Shopify, Amazon, Stripe, QuickBooks and 300+ apps if you'd rather keep a tool you already love.`],
    [`What happens when I grow or add locations?`, `Shuug scales from a solo owner to multi-site and enterprise without switching systems — add staff, roles, locations and your own modules. Because it's open source you can white-label and extend it however you need, and your data is always yours to export.`],
  ];
}

// --- unique, category-tailored hero visual per industry ---
const CAT_MOCK = {
  food:      { c:["🍽️ Covers","🔥 Kitchen"], rows:[["Covers today","84"],["Kitchen tickets","6 live",1],["Food cost","28%"]] },
  auto:      { c:["🔧 Bays","🧾 Work orders"], rows:[["Bays busy","3/4"],["Work orders due","3",1],["Parts to order","2 ⚠"]] },
  trades:    { c:["🏗️ Jobs","📋 Estimates"], rows:[["Jobs today","5"],["Estimates out","2",1],["Crew on site","4"]] },
  beauty:    { c:["📅 Booked","💇 Chairs"], rows:[["Booked today","12"],["No-shows","0"],["Rebook rate","74%",1]] },
  fitness:   { c:["🎟️ Members","🧘 Classes"], rows:[["Members","318"],["Classes today","6"],["Renewals due","9",1]] },
  education: { c:["🎓 Enrolled","📅 Classes"], rows:[["Enrolled","142"],["Classes today","8"],["Tuition due","3 ⚠",1]] },
  care:      { c:["🧸 Check-in","✅ Ratios"], rows:[["Checked in","28"],["Ratio","✓ ok"],["Pickups 3pm","11",1]] },
  online:    { c:["📦 Orders","🛒 Channels"], rows:[["Orders today","46"],["Unshipped","7",1],["Low stock","2 ⚠"]] },
  wholesale: { c:["🏭 Orders","🚚 Routes"], rows:[["Open orders","18"],["To pick","240 cs",1],["On account","$14k"]] },
  pro:       { c:["📊 P&amp;L","💳 Get paid"], rows:[["Revenue (mo)","$48k"],["Unpaid","$6k",1],["Books","✓"]] },
  nonprofit: { c:["💜 Gifts","📊 Programs"], rows:[["Donations (mo)","$22k"],["Grants open","3"],["Volunteers","41",1]] },
  topic:     { c:["📊 P&amp;L","💳 Get paid"], rows:[["Revenue (mo)","$48k"],["Unpaid","$6k",1],["Books","✓"]] },
};
function heroArt(b){
  const [slug,name,emoji,cat]=b;
  const m = CAT_MOCK[cat] || CAT_MOCK.pro;
  const rows = m.rows.map(r=>`<div class="frow${r[2]?" hot":""}"><span class="k">${esc(r[0])}</span><span class="v">${esc(r[1])}</span></div>`).join("");
  return `<div class="heroart">
    <div class="chip c1">${emoji} ${esc(name.split(" ")[0])}</div><div class="chip c2">${m.c[0]}</div><div class="chip c3">${m.c[1]}</div>
    <div class="fscreen rv"><div class="sb"><i></i><i></i><i></i><b>shuug · ${slug}</b></div><div class="sbody">
      ${rows}
      <div class="chart" style="margin-top:8px;height:112px"><span style="height:44%"></span><span style="height:66%"></span><span style="height:52%"></span><span style="height:84%"></span><span style="height:70%"></span><span style="height:96%"></span><span style="height:60%"></span></div>
    </div></div>
  </div>`;
}

function businessPage(b){
  const [slug,name,emoji,cat,tools]=b;
  const t0=TOOLS[tools[0]][0], t1=TOOLS[tools[1]][0], t2=TOOLS[tools[2]]?.[0]||"";
  const isTopic = cat==="topic";
  const title = isTopic
    ? `Free ${name} for small business — real, open, no lock-in | Shuug`
    : `Free ${name} software — booking, staff, invoicing & books | Shuug`;
  const desc = isTopic
    ? `Free, open-source ${name} for small business — ${t0}, ${t1} and the rest of your operation in one place. No per-seat fees, no lock-in.`
    : `Free, open-source ${name} software that runs the whole operation — ${t0}, ${t1}, ${t2}, staff & payroll, invoicing and real double-entry bookkeeping in one system. No per-seat fees. The all-in-one ${name} solution.`;
  const kw = `free ${name} software, ${name} software, ${name} management software, ${name} POS, ${name} scheduling software, ${name} booking software, free ${name} solution, ${name} bookkeeping, ${name} invoicing software, open source ${name} software, ${name} app, ${CATS[cat].toLowerCase()}, ${tools.slice(0,4).map(k=>TOOLS[k][0].toLowerCase()).join(", ")}`;
  const sib = B.filter(x=>x[3]===cat&&x[0]!==slug).slice(0,6);
  const rel = [...sib, bySlug["bookkeeping"]].filter((v,i,a)=>a.findIndex(y=>y[0]===v[0])===i).slice(0,6);

  return HEAD(title,desc,kw,slug)+NAV()+`
<header class="hero"><div class="wrap">
  <div>
    <span class="tag">${emoji} For ${esc(name)} · free</span>
    <h1>Run your entire <span class="grad">${esc(name)}</span>.<br><span class="grad2">Not just the books.</span></h1>
    <p class="lede">Staff, scheduling, timesheets, ${esc(t0.toLowerCase())}, ${esc(t1.toLowerCase())}${t2?`, ${esc(t2.toLowerCase())}`:""} — and yes, real books that keep themselves. Shuug runs the whole ${esc(name.toLowerCase())} so you're not duct-taping five apps and a spreadsheet together.</p>
    <div class="hcta"><a class="btn btn-hot" href="/">Open the app →</a><a class="btn btn-line" href="/welcome/platform">See how it works</a></div>
    <div class="hstats"><div><b class="grad">$0</b><span>free to use</span></div><div><b class="grad2">${tools.length}</b><span>tools, one login</span></div><div><b style="color:var(--lime)">1</b><span>place to run it all</span></div></div>
  </div>
  ${heroArt(b)}
</div></header>

<section style="padding-top:26px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">The all-in-one, free &amp; open ${esc(name)} system</div><h2>Everything ${art(name)} <span class="grad">${esc(name)}</span> needs — in one place</h2></div>
  <p class="overview rv">${overviewText(b)}</p>
</div></section>

<section style="padding-top:14px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">From booking to the books</div><h2>How a <span class="grad2">${esc(name)}</span> runs in Shuug</h2><p class="sub">Every stage of your day flows into the next — and posts itself to the books. Here's the exact path your work takes, using the tools built for your trade.</p></div>
  ${flowGraph(tools)}
</div></section>

<section style="padding-top:16px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Your ${esc(name)} toolkit</div><h2>Everything to run ${art(name)} ${esc(name)}</h2><p class="sub">Click any tool to see what it does, how it works and how the built-in AI can run it for you. Turn on what you need — every part talks to every other part.</p></div>
  <div class="fg stagger">${toolCards(tools)}</div>
</div></section>

<section style="padding-top:6px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">One connected system</div><h2>Operations, your team &amp; the money — <span class="grad">in one flow</span></h2><p class="sub">Books are the last step, not the whole story. The day-to-day and your crew feed the numbers automatically.</p></div>
  <div class="stack rv">
    <div class="layer"><b>Operations</b><span>Sales, jobs, bookings, orders &amp; menus — the day-to-day work</span><span class="pin">run the place</span></div>
    <div class="ar">↓</div>
    <div class="layer"><b>Your team</b><span>Staff, shifts, timesheets &amp; payroll — who's on, hours, pay</span><span class="pin">the crew</span></div>
    <div class="ar">↓</div>
    <div class="layer"><b>Get paid</b><span>Invoices, POS &amp; collections — priced, sent, paid, every way</span><span class="pin">the money in</span></div>
    <div class="ar">↓</div>
    <div class="layer hot"><b>Books &amp; reports</b><span>The ledger posts itself → P&amp;L, cash flow &amp; taxes, always right</span><span class="pin">handled</span></div>
  </div>
</div></section>

<section style="padding-top:6px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">More than software — it works for you</div><h2>AI <span class="grad2">Handlers</span> do the busywork</h2><p class="sub">Say what you wish you didn't have to do anymore. Shuug builds a Handler from your real data — customers, orders, calendar, staff — and it works Off, on Approval, or fully On. You're always in control.</p></div>
  <div class="fg stagger">
    <div class="fx fxstatic"><h5>Answer the phone &amp; book <span class="tag2 t-hand">Handler</span></h5><p>An AI receptionist books, reschedules and confirms appointments while you work.</p></div>
    <div class="fx fxstatic"><h5>Chase what's owed <span class="tag2 t-hand">Handler</span></h5><p>Sends invoice reminders on the right day and answers "what do I owe" for customers.</p></div>
    <div class="fx fxstatic"><h5>Never run out <span class="tag2 t-hand">Handler</span></h5><p>Watches stock and ingredients and drafts the reorder before you sell out.</p></div>
    <div class="fx fxstatic"><h5>Build the schedule <span class="tag2 t-hand">Handler</span></h5><p>Drafts next week's staff rota from your hours and warns about overtime first.</p></div>
    <div class="fx fxstatic"><h5>Map my week <span class="tag2 t-road">Roadmap</span></h5><p>Talk through your notes and Shuug turns them into an actionable plan of what to do next.</p></div>
    <div class="fx fxstatic"><h5>Answer customers <span class="tag2 t-hand">Handler</span></h5><p>Handles order status, hours and FAQs across email, SMS and chat — you approve what it can say.</p></div>
  </div>
  <p class="sub rv" style="margin-top:16px;font-size:14px">Handlers are approval-gated by default and never act outside what you allow. Live phone/SMS/email needs a connected channel in <a href="/welcome/features" style="color:var(--cyan)">Integrations</a>.</p>
</div></section>

<section style="padding-top:8px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Questions</div><h2>Free, real, and <span class="grad">yours</span></h2><p class="sub">Straight answers about running ${art(name)} ${esc(name)} on a free, open platform.</p></div>
  <div class="faq rv">${faqFor(b).map(q=>`<details><summary>${esc(q[0])}</summary><div class="fa">${q[1]}</div></details>`).join("")}</div>
</div></section>

<section style="padding-top:6px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">One dashboard, not ten tabs</div><h2>Your whole ${esc(name)}, <span class="grad">in one place</span></h2><p class="sub">Everything funnels into a single dashboard, built around you — 1000% free and 100% customizable. Extend it, brand it, or hand it to a dev to build on.</p></div>
  <div class="related stagger">
    <a href="/welcome/features"><span class="em">🏃</span> Business operations →</a>
    <a href="/welcome/bookkeeping"><span class="em">📚</span> Bookkeeping →</a>
    <a href="/welcome/features"><span class="em">🤖</span> AI employees →</a>
    <a href="/welcome/features"><span class="em">⚡</span> Workflows →</a>
    <a href="/welcome/features"><span class="em">📊</span> Business intelligence →</a>
    <a href="/welcome/features"><span class="em">🧩</span> Build your own tools →</a>
    <a href="/welcome/features"><span class="em">🏷️</span> White-label &amp; free →</a>
    <a href="/welcome/features"><span class="em">🔌</span> 300+ integrations →</a>
  </div>
</div></section>

<section style="padding-top:6px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Also for</div><h2>Related businesses</h2></div>
  <div class="related stagger">${rel.map(r=>`<a href="/welcome/${r[0]}"><span class="em">${r[2]}</span> ${r[1]} →</a>`).join("")}<a href="/welcome/industries"><span class="em">🗂️</span> All industries →</a></div>
</div></section>

<section><div class="wrap"><div class="band rv"><div class="eyebrow" style="background:var(--g-hot);-webkit-background-clip:text;background-clip:text;color:transparent">Ready</div><h2 style="margin:.3em 0">Run your whole ${esc(name)}. <span class="grad2">Shuug handles the rest.</span></h2><a class="btn btn-hot" href="/" style="margin-top:16px">Open the app →</a></div></div></section>
`+FOOTER(b)+TAIL;
}

function hubPage({slug,active,eyebrow,h1,sub}){
  const groups = Object.keys(CATS).filter(c=>c!=="topic").map(cat=>{
    const items = B.filter(b=>b[3]===cat);
    return `<h2 class="rv" style="font-size:22px;margin:30px 0 14px">${esc(CATS[cat])}</h2><div class="vgrid stagger">`+
      items.map(b=>`<a class="vt" href="/welcome/${b[0]}"><div class="vart" style="background:linear-gradient(120deg,#1e1740,#2a1e52)"><span class="em">${b[2]}</span></div><div class="vtx"><h4>${b[1]} →</h4><p>${esc(TOOLS[b[4][0]][0])}, ${esc(TOOLS[b[4][1]][0].toLowerCase())}, AI employees &amp; the books — one dashboard.</p></div></a>`).join("")+`</div>`;
  }).join("");
  const topics = B.filter(b=>b[3]==="topic").map(b=>`<a href="/welcome/${b[0]}"><span class="em">${b[2]}</span> ${b[1]} →</a>`).join("");
  return HEAD(
    slug==='industries'?"All industries — the full business suite for every business | Shuug":"Solutions — the whole suite your business runs on | Shuug",
    slug==='industries'?"Shuug is the free, all-in-one business suite for 45+ industries — Shopify, Amazon, restaurants, auto shops, salons, gyms, daycares, wholesale, trades, nonprofits and more. Operations, bookkeeping, AI employees, workflows and BI in one dashboard. Pick yours.":"Pick your business and see the whole suite Shuug gives you — operations, bookkeeping, AI employees, workflows and business intelligence, all in one customizable dashboard.",
    "business management software, bookkeeping, "+B.slice(0,20).map(b=>b[1].toLowerCase()).join(", "),
    slug)+NAV(active)+`
<div class="pagehead"><div class="wrap rv"><div class="eyebrow">${eyebrow}</div><h1 style="font-size:clamp(34px,4.6vw,54px)">${h1}</h1><p class="sub" style="max-width:680px;margin-top:16px">${sub}</p></div></div>
<section style="padding-top:20px"><div class="wrap">${groups}
  <h2 class="rv" style="font-size:22px;margin:34px 0 14px">By the numbers</h2>
  <div class="related stagger">${topics}</div>
</div></section>`+FOOTER(null)+TAIL;
}

// ---- write ----
mkdirSync(OUT,{recursive:true});
let n=0;
for(const b of B){ writeFileSync(path.join(OUT,`${b[0]}.html`), businessPage(b)); n++; }
writeFileSync(path.join(OUT,"industries.html"), hubPage({slug:"industries",active:"ind",eyebrow:"45+ industries",h1:"The full suite for <span class=\"grad\">every business</span>",sub:"One dashboard for your entire company — operations, bookkeeping, AI employees, workflows and business intelligence, whatever you run. 1000% free and 100% customizable. Pick your industry and see the exact suite Shuug gives you."})); n++;
writeFileSync(path.join(OUT,"features.html"), hubPage({slug:"features",active:"sol",eyebrow:"Pick your business",h1:"The whole suite <span class=\"grad\">your business</span> runs on",sub:"Don't shop for features — click your business type and we'll show you the whole suite: operations, bookkeeping, AI employees, workflows and BI, all funneled into one customizable dashboard. Stop jumping tool to tool."})); n++;

const urls = ["/welcome","/welcome/platform","/welcome/industries","/welcome/features","/welcome/builders","/welcome/ai-employees","/welcome/task-management","/welcome/workflows","/welcome/road-mapping","/welcome/business-intelligence","/welcome/staff-payroll","/welcome/operations",...B.map(b=>`/welcome/${b[0]}`)];
writeFileSync(path.join(OUT,"..","sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`+
urls.map(u=>`  <url><loc>${BASE}${u}</loc></url>`).join("\n")+`\n</urlset>\n`);

console.log(`generated ${n} pages + industries/features hubs + sitemap (${urls.length} urls) → ${OUT}`);
