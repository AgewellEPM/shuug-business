// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FEATURES, TEMPLATES } from "./catalog";
import { resolveRequest } from "./resolve";
import { trackerDefinitionSchema, validateValues } from "./model";
import { archiveRecord, createTracker, enableTemplate, readFeatures, saveRecord, setFeatureEnabled, setTrackerEnabled, toolLinks } from "./store";
import { answerRequest } from "./assistant";
import { computeAnalytics } from "../analytics/metrics";
import { recordsCsv } from "./export";
let folder:string;
beforeEach(()=>{folder=mkdtempSync(path.join(tmpdir(),"dealdesk-tools-test-"));vi.stubEnv("DEALDESK_DATA_DIR",folder);});
afterEach(()=>{vi.unstubAllEnvs();rmSync(folder,{recursive:true,force:true});});

describe("deterministic request routing",()=>{
  it.each([
    ["I need to track sample requests","sample-requests","template"],
    ["Set up buyer follow-ups","follow-ups","template"],
    ["Please track purchase orders","purchase-orders","template"],
    ["enable inventory","operations","feature"],
    ["Can you add delivery tracking","deliveries","template"],
    ["I want to track sales commissions","commissions","template"],
  ])("routes %s to the intended single tool",(text,id,type)=>{
    expect(resolveRequest(text)).toMatchObject({kind:"tools",activate:true,matches:[{id,type}]});
  });
  it.each(["Do not track returns","Don't add inventory","Enable inventory without shipping","delete tasks","never build samples"])("does not mutate negative/destructive requests: %s",text=>expect(resolveRequest(text)).toEqual({kind:"unsupported"}));
  it("requires a choice for two separate tools, and for questions",()=>{
    expect(resolveRequest("I need inventory and returns")).toMatchObject({kind:"tools",activate:false,matches:expect.arrayContaining([{id:"operations",type:"feature",name:"Inventory & shipping"},{id:"returns",type:"template",name:"Returns & credits"}])});
    expect(resolveRequest("How do I track sample requests?")).toMatchObject({kind:"tools",activate:false});
  });
  it("never confuses substrings or silently answers unsupported date ranges",()=>{
    expect(resolveRequest("What are our deadlines?")).toEqual({kind:"unsupported"});
    expect(resolveRequest("Show sales this month")).toMatchObject({kind:"tools",activate:false,matches:[{id:"calendar"}]});
    expect(resolveRequest("I need to track receipts")).toMatchObject({kind:"tools",activate:true,matches:[{id:"expenses"}]});
    expect(resolveRequest("Show sales by channel")).toEqual({kind:"answer",metric:"channels"});
    expect(resolveRequest("What are our competitors sales?")).toMatchObject({kind:"tools",activate:false,matches:[{id:"marketing"}]});
    expect(resolveRequest("What is our sales tax?")).toMatchObject({kind:"tools",activate:false,matches:[{id:"money"}]});
    expect(resolveRequest("Create a tracker for equipment with fields name, condition")).toEqual({kind:"custom",name:"equipment"});
  });
  it("has a valid definition for every shipped template and unique tool IDs",()=>{
    for(const t of TEMPLATES)expect(trackerDefinitionSchema.safeParse({name:t.name,description:t.description,fields:t.fields}).success).toBe(true);
    expect(new Set([...FEATURES,...TEMPLATES].map(t=>t.id)).size).toBe(FEATURES.length+TEMPLATES.length);
  });
});

describe("saved tools and records",()=>{
  it("activates only registered tools and preserves records when hidden/re-enabled",()=>{
    expect(()=>setFeatureEnabled("../../secrets",true)).toThrow("available tool");
    setFeatureEnabled("operations",true);expect(toolLinks()).toContainEqual({id:"operations",label:"Inventory & shipping",href:"/operations"});
    const first=enableTemplate("sample-requests").tracker;
    saveRecord(first.id,{id:randomUUID(),revision:0,channel:"stores",values:{company:"Test deli",status:"Requested"}});
    setTrackerEnabled(first.id,false);expect(toolLinks().some(t=>t.id===first.id)).toBe(false);
    const again=enableTemplate("sample-requests");expect(again.created).toBe(false);expect(again.tracker.id).toBe(first.id);expect(again.tracker.records).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(folder,"features.json"),"utf8")).trackers).toHaveLength(1);
  });
  it("deduplicates retries, rejects stale writes, and restores archived records",()=>{
    const t=enableTemplate("tasks").tracker,id=randomUUID();
    const input={id,revision:0,channel:"bulk",values:{task:"Call buyer",status:"To do"}};
    saveRecord(t.id,input);saveRecord(t.id,input);expect(readFeatures().trackers[0].records).toHaveLength(1);
    saveRecord(t.id,{...input,revision:1,values:{task:"Send quote",status:"In progress"}});
    expect(()=>saveRecord(t.id,{...input,revision:1})).toThrow("another tab");
    expect(()=>archiveRecord(t.id,id,1,true)).toThrow("another tab");
    archiveRecord(t.id,id,2,true);expect(readFeatures().trackers[0].records[0].archived).toBe(true);
    archiveRecord(t.id,id,3,false);expect(readFeatures().trackers[0].records[0]).toMatchObject({revision:4,archived:false});
  });
  it("creates a custom definition once and rejects reusing its receipt for different fields",()=>{
    const def={name:"Equipment",description:"",fields:[{id:"name",label:"Name",type:"text",required:true,options:[]}]},id=randomUUID();
    createTracker(def,id);expect(createTracker(def,id).created).toBe(false);
    expect(()=>createTracker({...def,name:"Something else"},id)).toThrow("different tracker");
  });
  it("fails closed on corrupted data or a live writer lock",()=>{
    writeFileSync(path.join(folder,"features.lock"),String(process.pid));expect(()=>enableTemplate("tasks")).toThrow("save is in progress");
    rmSync(path.join(folder,"features.lock"));writeFileSync(path.join(folder,"features.json"),"not json");
    expect(()=>enableTemplate("tasks")).toThrow("could not be read");expect(readFileSync(path.join(folder,"features.json"),"utf8")).toBe("not json");
  });
  it("validates types, required values, real dates and declared options",()=>{
    const t=TEMPLATES.find(t=>t.id==="promotions")!;
    expect(()=>validateValues(t.fields,{campaign:"  ",status:"Draft"})).toThrow("required");
    expect(()=>validateValues(t.fields,{campaign:"Test",status:"Launch everywhere"})).toThrow("Choose");
    expect(()=>validateValues(t.fields,{campaign:"Test",status:"Draft",start:"2026-02-30"})).toThrow("valid date");
    expect(()=>validateValues(t.fields,{campaign:"Test",status:"Draft",budget:1.001})).toThrow("decimal");
    expect(()=>validateValues(t.fields,{campaign:"Test",status:"Draft",budget:Infinity})).toThrow("valid number");
    expect(()=>validateValues(t.fields,{campaign:"Test",status:"Draft",execute:"shell"})).toThrow("fields changed");
    expect(validateValues(t.fields,{campaign:"Test",status:"Draft",budget:12.35,start:"2028-02-29"})).toMatchObject({budget:12.35,start:"2028-02-29"});
  });
  it("exports quoted CSV with spreadsheet formula protection",()=>{
    const t=enableTemplate("tasks").tracker;
    const saved=saveRecord(t.id,{id:randomUUID(),revision:0,channel:"online",values:{task:'=HYPERLINK("https://example.com")',status:"To do",notes:"One, two\nThree"}});
    const csv=recordsCsv(saved.fields,saved.records);expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');expect(csv).toContain('"One, two\nThree"');
  });
});

it("runs without a model or any remote calls and reports only observed changes",async()=>{
  const fetch=vi.fn(()=>{throw new Error("No remote calls allowed");});vi.stubGlobal("fetch",fetch);
  try {
    const load=vi.fn(async()=>({analytics:computeAnalytics([],[],[]),demo:true}));
    const result=await answerRequest("I need to track samples",load);expect(result.changed).toBe(true);expect(result.links?.[0].href).toMatch(/^\/trackers\//);expect(load).not.toHaveBeenCalled();
    const question=await answerRequest("How do I track returns?",load);expect(question.changed).toBeUndefined();expect(readFeatures().trackers).toHaveLength(1);
    const metrics=await answerRequest("Show sales",load);expect(metrics.answer).toContain("demo order data");expect(metrics.answer).toContain("no recorded orders");expect(fetch).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();}
});
