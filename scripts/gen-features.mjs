/**
 * Feature-page generator. One template → a dedicated page per product feature,
 * with a Zapier-style mega-menu drill-down in the nav. Run:
 *   node scripts/gen-features.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "site");
const BASE = "https://shuug.co";
const GH = "https://github.com/AgewellEPM/shuug-business";
const esc = s => s.replace(/&/g, "&amp;");

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
  <div class="nlinks"><a href="/welcome">Home</a><a href="/welcome/platform">How it works</a>${MEGA}<a href="/welcome/industries">Industries</a><a href="/welcome/features">Solutions</a><a href="/welcome/builders">Builders</a></div>
  <div class="right"><a class="ghchip" href="${GH}" target="_blank" rel="noopener">★ Open source</a><a class="btn btn-hot" href="/">Open the app →</a></div>
</div></nav>`;

const SCRIPT = `<script>(function(){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var pb=document.createElement('div');pb.className='progress';document.body.appendChild(pb);
var nav=document.querySelector('.nav');
function sc(){var h=document.documentElement,s=h.scrollTop||document.body.scrollTop,mx=(h.scrollHeight-h.clientHeight)||1;pb.style.width=(s/mx*100)+'%';if(nav)nav.classList.toggle('scrolled',s>8);}
document.addEventListener('scroll',sc,{passive:true});sc();
if(rm){document.querySelectorAll('.rv,.stagger').forEach(function(e){e.classList.add('in');});return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var el=e.target;el.classList.add('in');if(el.classList.contains('stagger')){var k=el.children,i;for(i=0;i<k.length;i++){k[i].style.transitionDelay=(i*60)+'ms';}}io.unobserve(el);});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv,.stagger').forEach(function(e){io.observe(e);});
document.querySelectorAll('.hstats b').forEach(function(el){var m=el.textContent.match(/^(\\D*)(\\d[\\d,]*)(.*)$/);if(!m)return;var pre=m[1],n=parseInt(m[2].replace(/,/g,''),10),suf=m[3];var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var t0=null;function st(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/1100,1),k=1-Math.pow(1-p,3);el.textContent=pre+Math.round(n*k).toLocaleString()+suf;if(p<1)requestAnimationFrame(st);}requestAnimationFrame(st);cio.unobserve(e.target);});},{rootMargin:'0px 0px -4% 0px'});cio.observe(el);});
var art=document.querySelector('.heroart,.fscreen');
document.querySelectorAll('.btn-hot').forEach(function(b){b.addEventListener('pointermove',function(ev){var r=b.getBoundingClientRect();b.style.transform='translate('+(((ev.clientX-r.left-r.width/2)/r.width)*8-3)+'px,'+(((ev.clientY-r.top-r.height/2)/r.height)*8-3)+'px)';});b.addEventListener('pointerleave',function(){b.style.transform='';});});
document.querySelectorAll('.fx.fxstatic,.layer,.tier').forEach(function(el){el.classList.add('zoomable');});
var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<div class="lb-card"><button class="lb-x" aria-label="Close">✕</button><div class="lb-in"></div></div>';document.body.appendChild(lb);
var inn=lb.querySelector('.lb-in');
function lbO(el){inn.innerHTML=el.innerHTML;lb.classList.add('on');document.body.style.overflow='hidden';}
function lbC(){lb.classList.remove('on');document.body.style.overflow='';}
document.addEventListener('click',function(e){var z=e.target.closest('.zoomable');if(z&&!e.target.closest('a,button,summary')){lbO(z);}});
lb.addEventListener('click',function(e){if(e.target===lb||e.target.closest('.lb-x'))lbC();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')lbC();});
})();</script>`;

// feature data
const F = [
  { slug:"task-management", name:"Task management", emoji:"✅", cat:"Work",
    grad:'<span class="grad">Task management</span> that runs the work',
    lede:"Boards, jobs and to-dos in one place — every task linked to the customer, order or job it belongs to. See work as a list, a board or a calendar, and finish it.",
    stats:[["3","list · board · calendar"],["Linked","to jobs & customers"],["Done","XP when you finish"]],
    screen:{title:"my work",rows:[["Prep Zhoug order","board"],["Call supplier — reorder","today",true],["Invoice #1042 follow-up","overdue"],["Fix patio table","backlog"]]},
    what:[["📋","Three views","See the same work as a list, a kanban board or a calendar — switch any time."],["🔗","Linked to everything","Tasks attach to a customer, order, job or invoice, so nothing floats free."],["👥","Assign & track","Give it to a teammate, set a due date, watch it move across the board."],["🔔","Nothing forgotten","Due-today and overdue surface at the top; reminders nudge before they slip."],["🏁","Get-it-done XP","Finishing tasks pays out XP — momentum you can actually see."],["🤖","AI can run it","An AI employee can create, assign and close routine tasks for you."]],
    how:[["Capture","Add a task from anywhere — a customer, a job, or straight onto a board."],["Organize","Drag it across the board, set who owns it and when it's due."],["Do the work","Work the list; linked records update as you go."],["Close it out","Mark it done — it logs, pays XP and clears from today."]],
    why:"Stop running your team from sticky notes and a group chat. One board, linked to the real work, so things actually get finished.",
    related:[["workflows","⚡","Flow"],["road-mapping","🧭","Road mapping"],["ai-employees","🤖","AI building"]] },

  { slug:"workflows", name:"Flow — workflows & automation", emoji:"⚡", cat:"Automate",
    grad:'<span class="grad2">Flow</span> — automation without the extra app',
    lede:"When this happens, do that. Route approvals, trigger reminders, move records and kick off jobs — built on guarded state transitions, so automation is auditable end to end. No separate automation tab open.",
    stats:[["If→Then","plain rules"],["Guarded","every transition audited"],["300+","apps to trigger"]],
    screen:{title:"flow · builder",rows:[["WHEN invoice > 14 days overdue","trigger"],["→ send reminder","step"],["→ log promise-to-pay","step",true],["→ create follow-up task","step"]]},
    what:[["🔀","If-this-then-that","Simple rules anyone can read: a trigger, then the steps that follow."],["🛡️","Guarded transitions","Every step is a checked state change — nothing skips a gate or double-fires."],["🧾","Fully audited","See exactly what ran, when, and what it changed — and undo it."],["🔌","Across your tools","Trigger Slack, email, a sheet or any of 300+ connected apps."],["⏱️","On a schedule","Run flows on time — every Monday, month-end, or on an event."],["🤖","AI in the loop","Let an AI employee run a flow, or draft one from a sentence."]],
    how:[["Pick a trigger","Choose what starts it — an event, a date, or a threshold."],["Add steps","Chain the actions: notify, update, create, assign."],["Set the guardrails","Decide what needs approval and what runs on its own."],["Turn it on","It runs itself — logged, auditable and reversible."]],
    why:"Automation that lives inside your business, not bolted on. Because the flow moves real records, it's safe by construction — and you can always see what it did.",
    related:[["task-management","✅","Task management"],["ai-employees","🤖","AI building"],["business-intelligence","📊","Business intelligence"]] },

  { slug:"road-mapping", name:"Road mapping", emoji:"🧭", cat:"Plan",
    grad:'<span class="grad">Road mapping</span> — plan the work',
    lede:"Talk through your notes and Shuug maps the steps you need to hit this week. Your own monday-style planning workspace: define what your job needs to accomplish, review the plan, and save an actionable roadmap.",
    stats:[["Notes","talk it through"],["Plan","reviewed steps"],["Saved","actionable roadmaps"]],
    screen:{title:"my roadmap",rows:[["This week — 6 steps","plan"],["1 · Reconcile last week","step"],["2 · Send 3 overdue reminders","step",true],["3 · Order Zhoug + Amba","step"]]},
    what:[["🗒️","Start from notes","Bring your notes and goals; Shuug turns them into a concrete plan."],["🧠","AI maps the steps","Ask for a roadmap and review the proposed steps before anything saves."],["✅","Actionable","Each step is a real task you can work — not a vague wish list."],["📅","Week or quarter","Map this week, or a longer plan you revisit and adjust."],["💾","Saved roadmaps","Keep plans, reopen them, and track what you actually finished."],["🔒","You approve","Nothing is saved until you okay the plan — it's your call."]],
    how:[["Add your notes","Jot what's on your plate, or pull in existing notes."],["Ask for a plan","Talk to the assistant: map the steps I need this week."],["Review & tweak","Edit the proposed steps — keep what fits, cut what doesn't."],["Save & work it","Save the roadmap; its steps become tasks you complete."]],
    why:"The gap between 'I have a lot to do' and 'here's exactly what to do next' — closed. Plan out loud, get a real list, get it done.",
    related:[["task-management","✅","Task management"],["workflows","⚡","Flow"],["ai-employees","🤖","AI building"]] },

  { slug:"business-intelligence", name:"Business intelligence", emoji:"📊", cat:"Know",
    grad:'<span class="grad2">Business intelligence</span> in one dashboard',
    lede:"Every number from every corner in one live dashboard — revenue, cash, stock, jobs, staff and margin. Know how the whole company is doing right now, without exporting a spreadsheet.",
    stats:[["Live","real-time, not exports"],["1","dashboard for it all"],["From","the real ledger"]],
    screen:{title:"dashboard",rows:[["Revenue (mo)","$48.2k"],["Unpaid A/R","$6.1k",true],["Days of cash","62 d"],["Low-stock items","2 ⚠"]]},
    what:[["📈","Real-time","Numbers update as work happens — no month-end export lag."],["🧮","From the ledger","BI reads the same double-entry books, so it always ties out."],["🗂️","Every corner","Sales, cash, stock, jobs, staff and margin — side by side."],["🚨","Flags & alerts","What needs attention floats up: overdue, low stock, thin margin."],["🔍","Drill in","Click any number to see the transactions behind it."],["🤖","Ask it","Ask AI 'how did we do last month' and get a plain-English read."]],
    how:[["It reads your data","Nothing to wire — BI sits on the same records the app creates."],["See the whole picture","Open one dashboard for revenue, cash, stock, jobs and staff."],["Spot what matters","Alerts and trends surface the things that need you."],["Drill to the source","Click through to the exact transactions, always."]],
    why:"Stop flying blind between quarterly spreadsheets. Know — today — whether you're making money, and where.",
    related:[["bookkeeping","📚","Bookkeeping"],["workflows","⚡","Flow"],["road-mapping","🧭","Road mapping"]] },

  { slug:"staff-payroll", name:"Staff, time & payroll", emoji:"🕒", cat:"Team",
    grad:'<span class="grad">Staff, time</span> & payroll',
    lede:"Time clock, timesheets, shifts and payroll — who's on, what it costs, and pay from real hours. No separate scheduling or payroll app; hours flow straight into job cost and the books.",
    stats:[["Clock","in/out anywhere"],["Hours","by job & shift"],["Pay","from real time"]],
    screen:{title:"team · today",rows:[["On shift now","4"],["Overtime risk","1 ⚠",true],["Hours this week","162"],["Next pay run","Fri"]]},
    what:[["⏱️","Time clock","Staff clock in/out on any device; hours are captured automatically."],["📅","Scheduling","Build shifts and rotas; see coverage and clashes at a glance."],["🧾","Timesheets","Hours roll up by job and department, ready to approve."],["💵","Payroll","Approved hours become a pay run with the right deductions."],["🏗️","Job cost","Labor lands on the job it belongs to, so profit is real."],["🤖","AI scheduling","An AI employee drafts next week's rota and flags overtime first."]],
    how:[["Clock in","Staff punch in on a phone, tablet or the front desk."],["Track hours","Time rolls into timesheets by job and shift."],["Approve","Review the week; fix anything before it's paid."],["Run payroll","Turn approved hours into pay — posted to the books."]],
    why:"Know who's on, what they cost, and pay them right — from the same hours that price your jobs. One system, no re-keying.",
    related:[["task-management","✅","Task management"],["bookkeeping","📚","Bookkeeping"],["business-intelligence","📊","Business intelligence"]] },

  { slug:"operations", name:"Business operations", emoji:"🏃", cat:"Run",
    grad:'<span class="grad2">Business operations</span> — the daily work',
    lede:"Orders, menus and recipes, inventory, bookings, jobs and work orders — the day-to-day of your company, built for your trade and wired into the books, so every action prices itself.",
    stats:[["All","the daily work"],["Trade","built for yours"],["Wired","into the books"]],
    screen:{title:"operations",rows:[["Open orders","12"],["Low stock — Zhoug","8 cs ⚠",true],["Bookings today","7"],["Work orders due","3"]]},
    what:[["🧾","Orders","Take and fulfill orders; each one updates stock and posts to the books."],["📦","Inventory","Levels, reorder points and days-of-cover across locations."],["🍽️","Menus & recipes","Cost every plate; update prices everywhere at once."],["📅","Bookings","Take appointments and reservations that respect staff and resources."],["🔧","Work orders","Estimate → approve → do → invoice, in one thread."],["🤖","AI can run it","Let an AI employee restock, book and chase for you."]],
    how:[["Do the work","Take an order, book a job, run the floor — for your trade."],["It updates everything","Stock, schedule and the books move on their own."],["Nothing re-typed","One action, everywhere it belongs."],["See it price itself","Every operation lands as real cost and revenue."]],
    why:"The floor and the books are the same records. Run the day-to-day and the accounting takes care of itself.",
    related:[["staff-payroll","🕒","Staff & payroll"],["business-intelligence","📊","Business intelligence"],["task-management","✅","Task management"]] },
];

const bySlug = Object.fromEntries(F.map(f => [f.slug, f]));

function page(f) {
  const title = `${f.name} — free, open, all-in-one | Shuug`;
  const desc = `${f.lede}`.slice(0, 180);
  const kw = `${f.name.toLowerCase()}, small business software, ${f.related.map(r => bySlug[r[0]] ? bySlug[r[0]].name.toLowerCase() : r[2].toLowerCase()).join(", ")}, free, open source`;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<meta name="keywords" content="${esc(kw)}"/>
<link rel="canonical" href="${BASE}/welcome/${f.slug}"/>
<link rel="stylesheet" href="/site/site.css"/></head><body><div class="aura"></div><div class="content">
${NAV()}
<header><div class="wrap"><div class="fhero">
  <div>
    <span class="tag">${f.emoji} ${esc(f.cat)} · free &amp; open</span>
    <h1>${f.grad}.</h1>
    <p class="lede">${esc(f.lede)}</p>
    <div class="hcta"><a class="btn btn-hot" href="/">Open the app →</a><a class="btn btn-line" href="/welcome/platform">See how it works</a></div>
    <div class="hstats">${f.stats.map(s => `<div><b class="grad">${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join("")}</div>
  </div>
  <div class="fscreen rv"><div class="sb"><i></i><i></i><i></i><b>shuug · ${f.slug}</b></div><div class="sbody">
    <div class="frow" style="background:transparent;border:0;padding:0 0 4px;font-family:var(--px);font-size:9px;color:var(--mut2)">${esc(f.screen.title.toUpperCase())}</div>
    ${f.screen.rows.map(r => `<div class="frow${r[2] ? " hot" : ""}"><span class="k">${esc(r[0])}</span><span class="v">${esc(r[1])}</span></div>`).join("")}
  </div></div>
</div></div></header>

<section style="padding-top:20px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">What it does</div><h2>Everything you need — <span class="grad2">nothing you don't</span></h2></div>
  <div class="fg stagger">${f.what.map(w => `<div class="fx fxstatic"><h5>${w[0]} ${esc(w[1])}</h5><p>${esc(w[2])}</p></div>`).join("")}</div>
</div></section>

<section style="padding-top:8px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">How it works</div><h2>From zero to <span class="grad">done</span>, in four steps</h2></div>
  <div class="stack rv">
    ${f.how.map((h, i) => `<div class="layer${i === f.how.length - 1 ? " hot" : ""}"><b>${i + 1} · ${esc(h[0])}</b><span>${esc(h[1])}</span><span class="pin">${i === f.how.length - 1 ? "done" : "step"}</span></div>${i < f.how.length - 1 ? '<div class="ar">↓</div>' : ""}`).join("")}
  </div>
</div></section>

<section style="padding-top:8px"><div class="wrap"><div class="whyband rv">
  <div class="eyebrow" style="background:var(--g-cool);-webkit-background-clip:text;background-clip:text;color:transparent">Why it matters</div>
  <h2 style="margin:.3em auto;max-width:760px">${esc(f.why)}</h2>
</div></div></section>

<section style="padding-top:8px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">More features</div><h2>Drill into the <span class="grad2">rest of the suite</span></h2></div>
  <div class="related stagger">${f.related.map(r => `<a href="/welcome/${r[0]}"><span class="em">${r[1]}</span> ${esc(r[2])} →</a>`).join("")}<a href="/welcome/features"><span class="em">🗂️</span> All features →</a></div>
</div></section>

<section><div class="wrap"><div class="band rv"><div class="eyebrow" style="background:var(--g-hot);-webkit-background-clip:text;background-clip:text;color:transparent">Ready</div><h2 style="margin:.3em 0">${esc(f.name)}, <span class="grad2">free &amp; open.</span></h2><div class="hcta" style="justify-content:center;margin-top:16px"><a class="btn btn-hot" href="/">Open the app →</a><a class="btn btn-line" href="${GH}" target="_blank" rel="noopener">★ Code on GitHub</a></div></div></div></section>

<footer><div class="wrap"><div class="fcols">
  <div><div class="brand" style="font-size:16px"><span class="m" style="width:26px;height:26px;font-size:14px">◎</span> Shuug</div><p class="mut" style="max-width:320px;font-size:13px;margin-top:12px">The first fully open-source business platform. MIT — own it, host it, move it.</p><span class="badge" style="margin-top:12px">★ Open source · MIT</span></div>
  <div><h6>Features</h6><a href="/welcome/bookkeeping">Bookkeeping</a><a href="/welcome/task-management">Task management</a><a href="/welcome/workflows">Flow</a><a href="/welcome/road-mapping">Road mapping</a></div>
  <div><h6>More</h6><a href="/welcome/business-intelligence">Business intelligence</a><a href="/welcome/ai-employees">AI employees</a><a href="/welcome/builders">Builders / MCP</a></div>
  <div><h6>Get started</h6><a href="/">Open the app</a><a href="${GH}" target="_blank" rel="noopener">★ Code on GitHub</a></div>
</div></div></footer>
</div>${SCRIPT}</body></html>`;
}

mkdirSync(OUT, { recursive: true });
let n = 0;
for (const f of F) { writeFileSync(path.join(OUT, `${f.slug}.html`), page(f)); n++; }
console.log(`generated ${n} feature pages → ${OUT}`);
