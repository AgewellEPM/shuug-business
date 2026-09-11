/**
 * Feature-page generator. One in-depth template → a thorough page per feature,
 * with a Zapier-style mega-menu drill-down in the nav. Run:
 *   node scripts/gen-features.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "site");
const BASE = "https://shuug.co";
const GH = "https://github.com/AgewellEPM/shuug-business";
const esc = s => String(s).replace(/&(?!amp;|lt;|gt;|#)/g, "&amp;");

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

const NAV = () => `<nav class="nav"><div class="wrap">
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
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var el=e.target;el.classList.add('in');if(el.classList.contains('stagger')){var k=el.children,i;for(i=0;i<k.length;i++){k[i].style.transitionDelay=(i*55)+'ms';}}io.unobserve(el);});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv,.stagger').forEach(function(e){io.observe(e);});
document.querySelectorAll('.hstats b').forEach(function(el){var m=el.textContent.match(/^(\\D*)(\\d[\\d,]*)(.*)$/);if(!m)return;var pre=m[1],n=parseInt(m[2].replace(/,/g,''),10),suf=m[3];var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var t0=null;function st(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/1100,1),k=1-Math.pow(1-p,3);el.textContent=pre+Math.round(n*k).toLocaleString()+suf;if(p<1)requestAnimationFrame(st);}requestAnimationFrame(st);cio.unobserve(e.target);});},{rootMargin:'0px 0px -4% 0px'});cio.observe(el);});
document.querySelectorAll('.btn-hot').forEach(function(b){b.addEventListener('pointermove',function(ev){var r=b.getBoundingClientRect();b.style.transform='translate('+(((ev.clientX-r.left-r.width/2)/r.width)*8-3)+'px,'+(((ev.clientY-r.top-r.height/2)/r.height)*8-3)+'px)';});b.addEventListener('pointerleave',function(){b.style.transform='';});});
document.querySelectorAll('.fx.fxstatic,.layer,.tier,.ucc').forEach(function(el){el.classList.add('zoomable');});
var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<div class="lb-card"><button class="lb-x" aria-label="Close">✕</button><div class="lb-in"></div></div>';document.body.appendChild(lb);
var inn=lb.querySelector('.lb-in');
function lbO(el){inn.innerHTML=el.innerHTML;lb.classList.add('on');document.body.style.overflow='hidden';}
function lbC(){lb.classList.remove('on');document.body.style.overflow='';}
document.addEventListener('click',function(e){var z=e.target.closest('.zoomable');if(z&&!e.target.closest('a,button,summary')){lbO(z);}});
lb.addEventListener('click',function(e){if(e.target===lb||e.target.closest('.lb-x'))lbC();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')lbC();});
})();</script>`;

// ------- feature content (in-depth, grounded in the real app) -------
const F = [
  {
    slug:"task-management", name:"Task management", emoji:"✅", cat:"Work",
    grad:'<span class="grad">Task management</span> that runs the work',
    lede:"Boards, jobs and to-dos in one place — every task linked to the customer, order or job it belongs to. See work as a list, a board or a calendar, and actually finish it.",
    stats:[["3","list · board · calendar"],["Linked","to jobs & customers"],["Done","XP when you finish"]],
    screen:{title:"my work",rows:[["Prep Zhoug order","board"],["Call supplier — reorder","today",true],["Invoice #1042 follow-up","overdue"],["Fix patio table","backlog"]]},
    overview:"Most small teams run on a whiteboard, a group chat and a lot of hoping. Shuug's task management replaces all three with one system where a task isn't a floating note — it's attached to the real thing it's about: a customer, an order, a job, an invoice. That link is the whole point. When you finish 'call supplier about the Zhoug reorder,' the reorder, the customer record and the day's plan all know it's done. You get three ways to look at the same work — a <b>list</b> for triage, a <b>board</b> for flow, and a <b>calendar</b> for when — so the view fits the moment instead of forcing you into one.",
    what:[
      ["📋","Three synced views","See the exact same tasks as a scannable list, a drag-and-drop kanban board, or a calendar. Switching views never loses context or duplicates anything — it's one dataset, shown three ways."],
      ["🔗","Linked to real records","Every task can hang off a customer, order, job, invoice or work order. Open the customer and see their open tasks; finish a task and the linked record reflects it."],
      ["👥","Assign, own, and due-date","Hand a task to a teammate, set who's accountable, and give it a due date. Role-aware, so people see the work that's theirs without wading through everyone else's."],
      ["🔔","Nothing slips","Due-today and overdue float to the top automatically. Reminders nudge before a deadline passes, so the important stuff doesn't quietly rot in a backlog."],
      ["🏁","Momentum you can see","Completing tasks pays out XP. It sounds small, but a visible 'you're moving' signal is the difference between a list that gets worked and one that gets ignored."],
      ["🤖","An AI employee can run it","Hand routine task-wrangling to a Handler: it can create, assign, chase and close recurring tasks, then report what it did — on your approval or fully on."],
    ],
    deep:[
      {h:"Boards that mirror how the work actually moves", p:["A board is only useful if its columns match your reality. Shuug lets a board represent a pipeline (New → In progress → Waiting → Done), a job's stages, or a simple this-week lane. Drag a card and its status updates everywhere it's referenced.","Because cards are linked to records, a board doubles as a live status of the underlying work — a 'Waiting' column full of jobs is instantly a cash-flow warning, not just a to-do backlog."]},
      {h:"Why linking beats a standalone to-do app", p:["A generic to-do app forgets what a task was for the moment you close the tab. Here, the task carries its context: the customer's history, the order total, the invoice that's owed. That means less re-typing, fewer 'wait, which job was this?' moments, and a clean audit trail of what got done and when."], list:[["<b>Less duplication</b> — the task and the record share one source of truth."],["<b>Better handoffs</b> — a teammate opens the task and has everything they need."],["<b>Real reporting</b> — finished tasks roll into business intelligence, not a separate silo."]]},
    ],
    how:[
      ["Capture","Add a task from anywhere — straight onto a board, or from a customer, order or job so it's linked from birth."],
      ["Organize","Drag it across the board, set the owner and a due date, and tag it to the record it belongs to."],
      ["Do the work","Work the list or the board; the linked records update as you move, so nothing is entered twice."],
      ["Close it out","Mark it done — it logs with a timestamp, pays XP, clears from today, and updates the linked record."],
    ],
    usecases:[
      ["🔧","Auto shop","Every repair order spawns its tasks — order the part, call for approval, road-test. The board is the shop's real-time status; nothing gets forgotten between bays."],
      ["🍽️","Restaurant","Prep lists, supplier calls and maintenance live on one board tied to inventory and reservations, so the opening manager sees exactly what's outstanding."],
      ["🧑‍💼","Solo owner","One 'my work' list, sorted by due-today, linking the invoice to chase and the client to follow up — the whole business on one screen."],
    ],
    faq:[
      ["Is this a separate app I have to keep in sync?","No. Tasks live inside the same workspace as your customers, orders and books — there's nothing to sync because it's one system."],
      ["Can I use it as a simple to-do list?","Yes. You don't have to link a task to anything. Start with a plain list; add links, boards and assignees when you want them."],
      ["Does finishing a task actually change my business data?","Only if the task is linked to a record and you choose to act on it. Completing a standalone task just marks it done; a linked task can update the record it references."],
      ["Can AI manage tasks for me?","Yes — an AI employee (a Handler) can create, assign, remind and close recurring tasks, approval-gated by default so it never acts outside what you allow."],
    ],
    why:"Stop running your team from sticky notes and a group chat. One board, linked to the real work, so things actually get finished — and the rest of your business knows about it.",
    related:[["workflows","⚡","Flow"],["road-mapping","🧭","Road mapping"],["ai-employees","🤖","AI building"]],
  },

  {
    slug:"workflows", name:"Flow — workflows & automation", emoji:"⚡", cat:"Automate",
    grad:'<span class="grad2">Flow</span> — automation without the extra app',
    lede:"When this happens, do that. Route approvals, trigger reminders, move records and kick off jobs — built on guarded state transitions, so automation is auditable end to end. No separate automation tab open.",
    stats:[["If→Then","plain rules"],["Guarded","every transition audited"],["300+","apps to trigger"]],
    screen:{title:"flow · builder",rows:[["WHEN invoice > 14 days overdue","trigger"],["→ send reminder","step"],["→ log promise-to-pay","step",true],["→ create follow-up task","step"]]},
    overview:"Automation usually means bolting a second product onto your business and hoping the two stay in sync. Flow is different because it lives <b>inside</b> the same core that runs your operations and books. A flow doesn't poke your data from the outside — it moves the real records through the same guarded state transitions a person would use. That's what makes it safe: an automated step can't do anything a human couldn't, can't skip a required gate, and can't silently double-fire. Every run is logged, attributable and reversible.",
    what:[
      ["🔀","If-this-then-that, readable","A flow is a trigger and the steps that follow, written so anyone on the team can read it — no scripting, no node-graph spaghetti."],
      ["🛡️","Guarded transitions","Each step is a checked state change. The engine enforces the same rules as the app: no skipping approvals, no billing an order twice, no impossible jumps."],
      ["🧾","Audited & reversible","See exactly what ran, when, what it changed and who (or what) triggered it. Because it moves real records, you can trace and undo it."],
      ["🔌","Across your tools","Trigger Slack messages, emails, a Google Sheet update, or any of 300+ connected apps via webhooks and Zapier — as steps in the same flow."],
      ["⏱️","On events or a schedule","Fire on a threshold (invoice 14 days overdue), on an event (new order), or on a clock (every Monday 9am, month-end)."],
      ["🤖","AI in the loop","Let an AI employee run a flow, decide a branch, or draft a whole flow from a plain-English sentence — with your approval on anything that acts."],
    ],
    deep:[
      {h:"What 'guarded state transition' actually means", p:["Everything important in your business is a state machine: an order is draft → reviewed → invoiced → paid; a work order is estimate → approved → done → billed. The engine only allows legal moves, and only when the preconditions are met (an order can't be invoiced twice; a refund keeps the original receipt).","Flow steps are just those same transitions, triggered automatically. So automation inherits every rule and guardrail your app already enforces — you can't automate your way into a broken ledger."]},
      {h:"Automation you can trust because you can see it", p:["The failure mode of most automation is silent: a Zap misfires at 2am and you find out from an angry customer. Here, every flow run is a first-class record with a full trail.",""], list:[["<b>Attribution</b> — who or what started it, and when."],["<b>Change log</b> — the exact records touched and how."],["<b>Approvals</b> — steps you mark as needing a human wait for your yes."],["<b>Undo</b> — because it moved real records, you can reverse it."]]},
    ],
    how:[
      ["Pick a trigger","Choose what starts it — an event (new order), a threshold (overdue > 14 days), or a schedule (every Monday)."],
      ["Add steps","Chain the actions: notify, update a record, create a task, post a journal, message an app."],
      ["Set the guardrails","Decide which steps run on their own and which pause for your approval."],
      ["Turn it on","It runs itself — every execution logged, auditable and reversible."],
    ],
    usecases:[
      ["💸","Collections on autopilot","When an invoice passes 14 days overdue: send a reminder, log the promise-to-pay, and create a follow-up task — every Monday, without you remembering."],
      ["📦","Never stock out","When an item drops below its reorder point: draft a purchase order, ping the manager in Slack, and open a 'confirm reorder' task."],
      ["🧾","Clean handoffs","When an order is marked reviewed: generate the invoice, email it, and post the journal entries — all as one auditable flow."],
    ],
    faq:[
      ["How is this different from Zapier?","Zapier connects apps from the outside. Flow moves your own records from the inside through guarded transitions — and it can still call Zapier and 300+ apps as steps. You get safety plus reach."],
      ["Can automation break my books?","No. Automated steps use the same rules as the app: balanced entries, no double-billing, required approvals. If a person can't do it, a flow can't either."],
      ["What if a flow does the wrong thing?","Every run is logged and reversible, and any step you mark 'needs approval' waits for you. You're never handing over blind control."],
      ["Do I need to code?","No. Flows are plain triggers and steps. Developers can go deeper via the open backend API and MCP, but the builder itself is no-code."],
    ],
    why:"Automation that lives inside your business, not bolted on. Because the flow moves real records through real guardrails, it's safe by construction — and you can always see exactly what it did.",
    related:[["task-management","✅","Task management"],["ai-employees","🤖","AI building"],["business-intelligence","📊","Business intelligence"]],
  },

  {
    slug:"road-mapping", name:"Road mapping", emoji:"🧭", cat:"Plan",
    grad:'<span class="grad">Road mapping</span> — plan the work',
    lede:"Talk through your notes and Shuug maps the steps you need to hit this week. Your own monday-style planning workspace: define what your job needs to accomplish, review the plan, and save an actionable roadmap.",
    stats:[["Notes","talk it through"],["Plan","reviewed steps"],["Saved","actionable roadmaps"]],
    screen:{title:"my roadmap",rows:[["This week — 6 steps","plan"],["1 · Reconcile last week","step"],["2 · Send 3 overdue reminders","step",true],["3 · Order Zhoug + Amba","step"]]},
    overview:"The hardest part of a busy week isn't doing the work — it's deciding what to do next when everything feels urgent. Road mapping closes the gap between 'I have a hundred things on my plate' and 'here are the exact six steps for this week.' You bring your notes and your goal; you talk it through with the assistant; it proposes a concrete, ordered plan grounded in your real business; you review and adjust; and it saves as an actionable roadmap whose steps become real tasks. Nothing is saved until you approve it — the AI drafts, <b>you decide</b>.",
    what:[
      ["🗒️","Start from your notes","Bring the mess in your head or your existing notes. Road mapping works from what you actually wrote, not a blank template."],
      ["🧠","AI proposes the steps","Ask for a plan and the assistant maps ordered steps from your notes and your business context — you see the proposal before anything is committed."],
      ["✅","Actionable, not aspirational","Each step is a real, workable task — not a vague 'grow revenue' wish. The plan is something you can start doing today."],
      ["📅","This week or the quarter","Map a tight weekly plan or a longer arc you revisit. Reopen a saved roadmap any time and adjust as reality changes."],
      ["💾","Saved & trackable","Roadmaps persist. Come back, see what you finished, and roll unfinished steps forward — planning that compounds instead of resetting."],
      ["🔒","You're always in control","The assistant only proposes. Nothing saves, and nothing acts, until you okay it. It's a thinking partner, not an autopilot you can't see."],
    ],
    deep:[
      {h:"From a conversation to a committed plan", p:["Road mapping is deliberately conversational. You describe what your job needs to accomplish, mention the notes to consider, and ask for a roadmap. The assistant reads only the notes you include, proposes steps, and shows its reasoning.","You edit freely — keep the good steps, cut the noise, reorder. When it fits, you save it. That save turns a conversation into a durable, trackable plan instead of advice you forget by lunch."]},
      {h:"Grounded in your real business", p:["Generic AI planners hallucinate tasks because they don't know your business. Road mapping is wired into your workspace — it can reference the invoices that are overdue, the stock that's low, the jobs that are open — so the plan reflects what's actually true right now."], list:[["<b>Real inputs</b> — your notes plus current business state."],["<b>Reviewed output</b> — you approve every step before it's saved."],["<b>Becomes work</b> — saved steps flow into task management."]]},
    ],
    how:[
      ["Add your notes","Jot what's on your plate this week, or pull in notes you've already made."],
      ["Ask for a plan","Talk to the assistant: 'map the steps I need to finish this week.'"],
      ["Review & tweak","Edit the proposed steps — keep what fits, cut what doesn't, reorder freely."],
      ["Save & work it","Save the roadmap; its steps become tasks you complete and track."],
    ],
    usecases:[
      ["🧑‍🔧","Service owner","Monday morning: dump the week's jobs and worries into notes, ask for a roadmap, and get an ordered plan that puts the overdue invoice and the parts order first."],
      ["📈","Growth push","Map a quarter: the assistant breaks 'launch the new menu' into sourcing, costing, staff training and marketing steps you actually schedule."],
      ["🧾","Catch-up week","Behind on everything? Talk it through and get a triage plan — reconcile, chase money, restock — instead of freezing at the size of the pile."],
    ],
    faq:[
      ["Does it decide things for me?","No. It proposes a plan you review and edit. Nothing is saved or acted on without your approval."],
      ["Which AI model does it use?","Whichever you point it at — a local model via Ollama for fully-offline planning, or Claude. You bring your own model; there's no bundled per-token bill."],
      ["Is my data sent anywhere?","With a local model, planning runs entirely on your machine. With a hosted model, only the notes you include are sent — you control what's shared."],
      ["What happens to a saved roadmap?","It persists in your workspace. Reopen it, track what you finished, and carry unfinished steps into next week."],
    ],
    why:"The gap between 'I have a lot to do' and 'here's exactly what to do next' — closed. Plan out loud, get a real list, get it done.",
    related:[["task-management","✅","Task management"],["workflows","⚡","Flow"],["ai-employees","🤖","AI building"]],
  },

  {
    slug:"business-intelligence", name:"Business intelligence", emoji:"📊", cat:"Know",
    grad:'<span class="grad2">Business intelligence</span> in one dashboard',
    lede:"Every number from every corner in one live dashboard — revenue, cash, stock, jobs, staff and margin. Know how the whole company is doing right now, without exporting a spreadsheet.",
    stats:[["Live","real-time, not exports"],["1","dashboard for it all"],["Ledger","numbers that tie out"]],
    screen:{title:"dashboard",rows:[["Revenue (mo)","$48.2k"],["Unpaid A/R","$6.1k",true],["Days of cash","62 d"],["Low-stock items","2 ⚠"]]},
    overview:"BI in most small businesses means exporting three spreadsheets once a quarter and squinting. Shuug's business intelligence is different for one structural reason: it reads the <b>same double-entry ledger and operational records the app already creates</b>. There's no separate data warehouse to build, no nightly sync to break, and no reconciliation between 'the dashboard' and 'the books' — because they're the same numbers. That means the dashboard is both live and trustworthy: what you see updates as work happens, and it always ties out to your actual accounts.",
    what:[
      ["📈","Real-time, not month-end","Numbers move as sales, payments and shifts happen. You're not waiting for an export to know how today went."],
      ["🧮","Straight from the ledger","BI reads the same balanced entries your operations created, so revenue, margin and cash always agree with the books."],
      ["🗂️","Every corner, side by side","Sales, cash runway, stock, open jobs, staff hours and margin — the whole company on one screen instead of six tabs."],
      ["🚨","Flags what needs you","Overdue A/R, low stock, thin-margin items and cash crunches surface themselves, so attention goes where it matters."],
      ["🔍","Drill to the transaction","Click any number and see the exact records behind it. No black-box metrics — every figure traces to its source."],
      ["🤖","Ask it in plain English","Ask an AI employee 'how did we do last month?' and get a plain-language read of the same numbers, with the detail one click away."],
    ],
    deep:[
      {h:"One source of truth, not a copy of one", p:["The classic BI problem is drift: the dashboard says one thing, the accountant says another, and nobody trusts either. That happens because the dashboard is a <em>copy</em> of the data, assembled by a pipeline that quietly rots.","Here, the dashboard isn't a copy — it's a live read of the ledger and operational tables. If a sale posted, the dashboard reflects it; if it reversed, so does the number. There's nothing to reconcile because there's only one set of books."]},
      {h:"Metrics that mean something for a small business", p:["Enterprise BI drowns you in vanity charts. Shuug focuses on the numbers that decide whether you make payroll and whether you're actually profitable:"], list:[["<b>Cash runway</b> — weeks of cash given real inflows and outflows."],["<b>A/R aging</b> — who owes you, how overdue, and how much."],["<b>True margin</b> — revenue minus real COGS, per item or job."],["<b>Days of cover</b> — how long stock lasts before you run out."]]},
    ],
    how:[
      ["It reads your data","Nothing to wire up — BI sits directly on the records the app already creates."],
      ["See the whole picture","Open one dashboard for revenue, cash, stock, jobs and staff at a glance."],
      ["Spot what matters","Alerts and trends surface the handful of things that actually need you today."],
      ["Drill to the source","Click through from any number to the exact transactions behind it."],
    ],
    usecases:[
      ["🛍️","Retail / e-com","See margin by product and channel in real time, catch a bestseller about to stock out, and know your cash runway before you reorder."],
      ["🔧","Service business","Track job profitability, A/R aging and staff hours together — so you bid better and chase money before it ages."],
      ["🍽️","Restaurant","Watch food cost, covers and cash on one screen; the low-stock and thin-margin flags catch problems before service does."],
    ],
    faq:[
      ["Do I have to set up reports?","No. The core dashboard is there from day one because it reads your existing data. You don't build a pipeline."],
      ["Will the dashboard match my accountant's numbers?","Yes — it reads the same double-entry ledger, so BI and the books are the same source, not two that need reconciling."],
      ["Is it real-time?","Yes. Figures update as sales, payments and shifts post, not on a nightly batch."],
      ["Can I ask questions in plain language?","Yes, by pointing an AI employee at the data — ask 'how did we do last month?' and get a plain-English answer with the detail one click away."],
    ],
    why:"Stop flying blind between quarterly spreadsheets. Know — today — whether you're making money, and exactly where.",
    related:[["bookkeeping","📚","Bookkeeping"],["workflows","⚡","Flow"],["road-mapping","🧭","Road mapping"]],
  },

  {
    slug:"staff-payroll", name:"Staff, time & payroll", emoji:"🕒", cat:"Team",
    grad:'<span class="grad">Staff, time</span> & payroll',
    lede:"Time clock, timesheets, shifts and payroll — who's on, what it costs, and pay from real hours. No separate scheduling or payroll app; hours flow straight into job cost and the books.",
    stats:[["Clock","in/out anywhere"],["Hours","by job & shift"],["Pay","from real time"]],
    screen:{title:"team · today",rows:[["On shift now","4"],["Overtime risk","1 ⚠",true],["Hours this week","162"],["Next pay run","Fri"]]},
    overview:"Blue-collar and shift businesses lose real money in the seams between four apps: one to schedule, one to clock, one to run payroll, and a spreadsheet to figure out what each job actually cost in labor. Shuug closes those seams. A clock-in is the <b>same</b> hour that fills the timesheet, prices the job, and feeds the pay run — captured once, used everywhere. That means labor cost is real (not a guess), overtime is caught before it happens, and payroll comes from the hours people actually worked instead of a hand-typed rekey.",
    what:[
      ["⏱️","Time clock, anywhere","Staff clock in and out on a phone, tablet or the front desk. Hours are captured automatically — no paper cards, no honor system."],
      ["📅","Scheduling & shifts","Build the week's rota, see coverage and clashes at a glance, and publish it. Everyone knows when they're on."],
      ["🧾","Timesheets that roll up","Hours total by employee, job and department, ready to review. Fix an anomaly before it's paid, not after."],
      ["💵","Payroll from real hours","Approved timesheets become a pay run with the right overtime and deductions — no re-keying from a separate system."],
      ["🏗️","Labor lands on the job","Hours attach to the job or ticket they were worked on, so job profitability includes real labor cost, not a flat estimate."],
      ["🤖","AI scheduling help","An AI employee can draft next week's rota from your patterns and flag overtime risk before you publish it."],
    ],
    deep:[
      {h:"Capture the hour once, use it four ways", p:["The single biggest source of payroll error is re-entry — hours copied from a clock to a timesheet to a payroll app, losing accuracy at every hop. Here the hour is captured once at clock-in and referenced everywhere it's needed.","That one fact fixes a chain of problems: timesheets are automatically right, job cost is automatically real, and the pay run is automatically from true hours. There's nothing to reconcile between systems because there's one system."]},
      {h:"Catch overtime and coverage before they cost you", p:["Overtime and understaffing are both expensive, and both are avoidable if you can see them coming. The schedule and the live clock together give you that foresight:"], list:[["<b>Overtime risk</b> flags an employee trending past their hours <em>before</em> the shift, while you can still adjust."],["<b>Coverage gaps</b> show on the rota so a shift isn't discovered empty an hour before open."],["<b>Hours-by-job</b> tells you which jobs are eating labor, so you bid the next one right."]]},
    ],
    how:[
      ["Clock in","Staff punch in on a phone, tablet or the front desk when they start."],
      ["Track hours","Time rolls into timesheets automatically, split by job and shift."],
      ["Approve","Review the week and fix any anomaly before anything is paid."],
      ["Run payroll","Turn approved hours into a pay run — overtime and deductions applied, posted to the books."],
    ],
    usecases:[
      ["🔧","Trades & field crews","Clock in on the phone at the job site; hours land on that job so profitability is real and the pay run writes itself."],
      ["🍽️","Restaurant","Schedule the line, catch overtime before Friday, and pay from the exact hours worked — with labor cost visible against covers."],
      ["🧼","Cleaning / routes","Hours-by-job across a dozen sites tells you which contracts are actually profitable and which to re-price."],
    ],
    faq:[
      ["Do I still need a separate payroll app?","No — timesheets flow into a pay run inside Shuug, posted to the books. It replaces the schedule/clock/payroll app stack."],
      ["Does labor cost show up on jobs automatically?","Yes. Hours attach to the job or ticket they were worked on, so job profitability includes real labor, not a flat estimate."],
      ["Can it warn me about overtime?","Yes. Overtime risk is flagged from the schedule and live clock before the shift, while you can still adjust."],
      ["Can AI build the schedule?","An AI employee can draft next week's rota from your patterns and flag overtime — you review and publish."],
    ],
    why:"Know who's on, what they cost, and pay them right — from the same hours that price your jobs. One system, no re-keying.",
    related:[["task-management","✅","Task management"],["bookkeeping","📚","Bookkeeping"],["business-intelligence","📊","Business intelligence"]],
  },

  {
    slug:"operations", name:"Business operations", emoji:"🏃", cat:"Run",
    grad:'<span class="grad2">Business operations</span> — the daily work',
    lede:"Orders, menus and recipes, inventory, bookings, jobs and work orders — the day-to-day of your company, built for your trade and wired into the books, so every action prices itself.",
    stats:[["All","the daily work"],["Trade","built for yours"],["Wired","into the books"]],
    screen:{title:"operations",rows:[["Open orders","12"],["Low stock — Zhoug","8 cs ⚠",true],["Bookings today","7"],["Work orders due","3"]]},
    overview:"Operations is the part of the business that actually makes money — taking the order, running the line, doing the job — and it's usually the part most disconnected from the books. Shuug is built so the floor and the ledger are the <b>same records</b>. Ring a sale and stock drops, the ledger posts, and the dashboard updates in the same motion. That's what 'wired into the books' means: you don't run operations in one app and then re-type it into accounting — the operational action <em>is</em> the accounting event, priced and posted as it happens.",
    what:[
      ["🧾","Orders & fulfillment","Take orders, fulfill them, and watch each one draw down stock and post to the books — no separate entry, no reconciliation."],
      ["📦","Inventory & reorder","Live levels, reorder points and days-of-cover across locations, so you restock before you sell out and never dead-stock cash."],
      ["🍽️","Menus, recipes & costing","Build menus and recipes, cost every plate to the ingredient, and push a price change everywhere at once."],
      ["📅","Bookings & appointments","Take reservations and appointments that respect staff, resources and turn times — online and by phone, on one calendar."],
      ["🔧","Work orders","Estimate → approve → do the work → invoice, in one thread, with parts and labor rolling into cost and the books."],
      ["🤖","AI can run the routine","An AI employee can restock, confirm bookings and chase approvals, so the repetitive operational chores run themselves."],
    ],
    deep:[
      {h:"The operational action IS the accounting event", p:["In a typical stack, a sale happens in the POS, then someone (or a fragile integration) mirrors it into accounting later. Every mirror is a chance to drift.","Shuug removes the mirror. When you complete a sale, the inventory movement, the revenue, the tax and the COGS post together as one transaction. The books are a byproduct of running the business correctly, not a second job you do at night."]},
      {h:"Built for your trade, not a generic template", p:["A restaurant needs a kitchen board and recipe costing; an auto shop needs work orders and vehicle history; a wholesaler needs volume pricing and routes. Shuug molds to the trade you pick, turning on the operational tools that fit and hiding the ones that don't."], list:[["<b>Right tools on</b> — the industry profile chooses the controls."],["<b>Everything connected</b> — those tools still feed one ledger and dashboard."],["<b>Grows with you</b> — add locations, staff and modules without switching systems."]]},
    ],
    how:[
      ["Do the work","Take an order, book a job, run the floor — with the tools built for your trade."],
      ["It updates everything","Stock, schedule and the books move on their own as you work."],
      ["Nothing re-typed","One action lands everywhere it belongs — no double entry."],
      ["See it price itself","Every operation posts as real cost and revenue, live on the dashboard."],
    ],
    usecases:[
      ["🍽️","Restaurant","Menu, recipes, kitchen board and reservations run service; food cost and covers land on the books and dashboard automatically."],
      ["🔧","Auto shop","Work orders carry parts, labor and vehicle history; approve, do, invoice — and job profit is real."],
      ["🏭","Wholesale","Orders, volume pricing, inventory and routes move product; every movement prices itself into COGS and margin."],
    ],
    faq:[
      ["Do I run operations and accounting in two places?","No — they're the same records. An operational action (a sale, a job) posts to the books as it happens, so there's nothing to re-enter."],
      ["Is it specific to my industry?","Yes. You pick your trade and Shuug turns on the right operational tools — kitchen board, work orders, routes, recipes — and hides the rest."],
      ["Does stock stay accurate?","Every sale, return and delivery adjusts levels automatically, with reorder points and days-of-cover so you restock in time."],
      ["Can I add locations later?","Yes — inventory, staff and modules scale across multiple locations without moving to a different system."],
    ],
    why:"The floor and the books are the same records. Run the day-to-day and the accounting takes care of itself.",
    related:[["staff-payroll","🕒","Staff & payroll"],["business-intelligence","📊","Business intelligence"],["task-management","✅","Task management"]],
  },
];

const bySlug = Object.fromEntries(F.map(f => [f.slug, f]));

function page(f) {
  const title = `${f.name} — free, open, all-in-one | Shuug`;
  const desc = String(f.lede).slice(0, 180);
  const kw = `${f.name.toLowerCase()}, small business software, ${f.related.map(r => bySlug[r[0]] ? bySlug[r[0]].name.toLowerCase() : r[2].toLowerCase()).join(", ")}, free, open source`;
  const deep = f.deep.map(d => `<div class="deep rv"><h3>${esc(d.h)}</h3>${d.p.filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")}${d.list ? `<ul>${d.list.map(li => `<li>${li[0]}</li>`).join("")}</ul>` : ""}</div>`).join("");
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
    <div class="hcta"><a class="btn btn-hot" href="/">Open the app →</a><a class="btn btn-line" href="#deep">Read the details</a></div>
    <div class="hstats">${f.stats.map(s => `<div><b class="grad">${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join("")}</div>
  </div>
  <div class="fscreen rv"><div class="sb"><i></i><i></i><i></i><b>shuug · ${f.slug}</b></div><div class="sbody">
    <div class="frow" style="background:transparent;border:0;padding:0 0 4px;font-family:var(--px);font-size:9px;color:var(--mut2)">${esc(f.screen.title.toUpperCase())}</div>
    ${f.screen.rows.map(r => `<div class="frow${r[2] ? " hot" : ""}"><span class="k">${esc(r[0])}</span><span class="v">${esc(r[1])}</span></div>`).join("")}
  </div></div>
</div></div></header>

<section style="padding-top:14px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Overview</div><h2>What it is, <span class="grad2">and why it's different</span></h2></div>
  <p class="overview rv">${esc(f.overview)}</p>
</div></section>

<section style="padding-top:18px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Capabilities</div><h2>Everything it does — <span class="grad">in full</span></h2><p class="sub">Click any capability to blow it up. Every one is real and included — no paywalled tiers, no vaporware.</p></div>
  <div class="fg stagger">${f.what.map(w => `<div class="fx fxstatic"><h5>${w[0]} ${esc(w[1])}</h5><p>${esc(w[2])}</p></div>`).join("")}</div>
</div></section>

<section id="deep" style="padding-top:22px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">In depth</div><h2>How it really works, <span class="grad2">no hand-waving</span></h2></div>
  ${deep}
</div></section>

<section style="padding-top:18px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Step by step</div><h2>From zero to <span class="grad">done</span></h2></div>
  <div class="stack rv">
    ${f.how.map((h, i) => `<div class="layer${i === f.how.length - 1 ? " hot" : ""}"><b>${i + 1} · ${esc(h[0])}</b><span>${esc(h[1])}</span><span class="pin">${i === f.how.length - 1 ? "done" : "step"}</span></div>${i < f.how.length - 1 ? '<div class="ar">↓</div>' : ""}`).join("")}
  </div>
</div></section>

<section style="padding-top:22px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Use cases</div><h2>What it looks like <span class="grad2">in a real business</span></h2></div>
  <div class="uc stagger">${f.usecases.map(u => `<div class="ucc"><div class="who"><span class="e">${u[0]}</span> ${esc(u[1])}</div><p>${esc(u[2])}</p></div>`).join("")}</div>
</div></section>

<section style="padding-top:22px"><div class="wrap">
  <div class="head rv"><div class="eyebrow">Questions</div><h2>Straight <span class="grad">answers</span></h2></div>
  <div class="faq rv">${f.faq.map(q => `<details><summary>${esc(q[0])}</summary><div class="fa">${esc(q[1])}</div></details>`).join("")}</div>
</div></section>

<section style="padding-top:14px"><div class="wrap"><div class="whyband rv">
  <div class="eyebrow" style="background:var(--g-cool);-webkit-background-clip:text;background-clip:text;color:transparent">Why it matters</div>
  <h2 style="margin:.3em auto;max-width:780px">${esc(f.why)}</h2>
</div></div></section>

<section style="padding-top:16px"><div class="wrap">
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
console.log(`generated ${n} in-depth feature pages → ${OUT}`);
