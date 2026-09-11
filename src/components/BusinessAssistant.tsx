"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askAssistantAction } from "@/app/copilot/actions";
import { activateToolAction } from "@/app/features/actions";
import type { AssistantReply } from "@/lib/features/assistant";

const examples=["I need to track sample requests","Set up buyer follow-ups","Show sales by channel","Enable inventory","Create a custom tracker"];
export function BusinessAssistant() {
  const router=useRouter(), [question,setQuestion]=useState(""), [pending,start]=useTransition();
  const [messages,setMessages]=useState<{question:string;reply:AssistantReply}[]>([]), end=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(messages.length)end.current?.scrollIntoView?.({behavior:"smooth",block:"nearest"});},[messages.length]);
  function ask(text:string) {
    if(!text.trim()||pending)return;
    setQuestion("");start(async()=>{
      try {const reply=await askAssistantAction(text);setMessages(m=>[...m,{question:text,reply}]);if(reply.changed)router.refresh();}
      catch {setMessages(m=>[...m,{question:text,reply:{answer:"The connection was interrupted. Try again; existing trackers will be reopened."}}]);}
    });
  }
  function choose(choice:NonNullable<AssistantReply["choices"]>[number]) {
    start(async()=>{
      try {const r=await activateToolAction(choice.id,choice.type);setMessages(m=>[...m,{question:`Open / set up ${choice.name}`,reply:r.ok?r.result:{answer:r.error}}]);if(r.ok)router.refresh();}
      catch {setMessages(m=>[...m,{question:choice.name,reply:{answer:"The tool could not be opened. Try again."}}]);}
    });
  }
  return <div className="mx-auto max-w-5xl">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="dd-eyebrow">Your business, ready to work</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">What do you need to get done?</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Open a business tool, set up a tracker, or ask about your sales. No AI account needed.</p></div><Link href="/features" className="dd-button">Browse tools ↗</Link></header>
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <section className="dd-card overflow-hidden p-0" aria-label="Business assistant"><div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Ready · Built-in tools and templates</div>
        <div className="max-h-[55vh] min-h-[230px] space-y-6 overflow-y-auto p-5" role="log" aria-label="Conversation" aria-live="polite">
          {!messages.length&&<div className="py-5"><span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700">✦</span><h2 className="text-lg font-semibold">Start with what you need.</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">“I need to track sample requests” creates a saved tracker with buyer, product, status and follow-up fields. Your new tool appears in the sidebar immediately.</p></div>}
          {messages.map((m,i)=><div key={i} className="space-y-3"><p className="ml-8 rounded-xl bg-[#edf2ed] px-4 py-3 text-sm">{m.question}</p><div className="mr-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Assistant</p><p className="whitespace-pre-line text-sm leading-6 text-slate-700">{m.reply.answer}</p><div className="mt-3 flex flex-wrap gap-2">{m.reply.links?.map(l=><Link className="dd-button" key={l.href} href={l.href}>{l.label} ↗</Link>)}{m.reply.choices?.map(c=><button key={c.id} className="dd-button" disabled={pending} onClick={()=>choose(c)}>{c.type==="template"?"Set up":"Open"} {c.name}</button>)}</div></div></div>)}
          {pending&&<p role="status" className="text-sm text-slate-500">Checking your request…</p>}<div ref={end}/>
        </div>
        <form onSubmit={e=>{e.preventDefault();ask(question);}} className="border-t border-slate-100 p-4"><label htmlFor="assistant-request" className="sr-only">What do you need?</label><textarea id="assistant-request" maxLength={1000} rows={2} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="I need to track…" className="dd-input resize-none"/><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[11px] text-slate-400">Tools and records stay saved when this chat closes.</span><button disabled={pending||!question.trim()} className="dd-primary">Send ↑</button></div></form>
      </section>
      <aside className="space-y-4"><div className="dd-card"><h2 className="text-sm font-semibold">Try a request</h2><div className="mt-3 space-y-2">{examples.map(q=><button key={q} disabled={pending} onClick={()=>ask(q)} className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs leading-5 text-slate-600 hover:border-emerald-500 hover:bg-emerald-50">{q} <span aria-hidden>↗</span></button>)}</div></div><div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-5"><h2 className="text-sm font-semibold text-emerald-900">Predictable by design</h2><p className="mt-2 text-xs leading-5 text-emerald-900/75">Requests select existing tools and templates. Custom trackers use fields you review. Sending campaigns, invoices, or messages stays in each tool&apos;s review flow.</p><Link href="/features#how-it-works" className="mt-3 inline-block text-xs font-medium text-emerald-800 underline">See how it works</Link></div></aside>
    </div>
  </div>;
}
