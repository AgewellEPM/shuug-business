import { FEATURES, TEMPLATES } from "./catalog";
export type Intent =
  | { kind: "help" }
  | { kind: "answer"; metric: "sales" | "products" | "customers" | "channels" }
  | { kind: "tools"; matches: { id: string; type: "feature" | "template"; name: string }[]; activate: boolean }
  | { kind: "custom"; name: string }
  | { kind: "unsupported" };
export const normalize = (text: string) => text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const contains = (text: string, phrase: string) => (` ${text} `).includes(` ${normalize(phrase)} `);

/** Bounded phrase routing. No LLM, fuzzy intent inference, eval, or arbitrary
 * writes. Questions and negatives never activate features. */
export function resolveRequest(input: string): Intent {
  const q = normalize(input);
  if (!q || input.length > 1000) return { kind: "unsupported" };
  if (["help", "what can you do", "show tools", "show features", "available tools"].includes(q)) return { kind: "help" };
  if (/\b(dont|do not|never|disable|hide|remove|delete|without|except|stop)\b/.test(q)) return { kind: "unsupported" };
  if (/\b(social|instagram|tiktok|facebook|youtube|linkedin|pinterest|threads|bluesky)\b/.test(q)) return {kind:"tools",matches:[{id:"social",type:"feature",name:"Social marketing"}],activate:false};
  // Competitor and tax questions cannot be answered using our own order total.
  if (/\b(competitor|competitors|competition)\b/.test(q)) return {kind:"tools",matches:[{id:"marketing",type:"feature",name:"Marketing"}],activate:false};
  if (/\b(tax|taxes|vat|settlement|settlements|bank|payout|payouts)\b/.test(q)) return {kind:"tools",matches:[{id:"money",type:"feature",name:"Money"}],activate:false};
  // Dated sales and margin questions open the deterministic calendar analysis.
  if (/\b(today|yesterday|day|daily|week|month|monthly|year|yearly|profit|margin|margins|tomorrow)\b/.test(q) && /\b(sales|revenue|orders|profit|margin|margins)\b/.test(q)) return {kind:"tools",matches:[{id:"calendar",type:"feature",name:"Business calendar"}],activate:false};
  if (/\b(predict|forecast)\b/.test(q)) return {kind:"tools",matches:[{id:"reports",type:"feature",name:"Sales reports"}],activate:false};
  if (/^(show |what |how |who |which |total |sales |revenue |best |top )/.test(`${q} `)) {
    if (/\b(channel|channels|bulk|stores|online)\b/.test(q) && /\b(sales|revenue|compare|comparison|channel|channels)\b/.test(q)) return {kind:"answer",metric:"channels"};
    if (/\b(best|top)\b/.test(q) && /\b(product|products|selling|sellers)\b/.test(q)) return {kind:"answer",metric:"products"};
    if (/\b(best|top)\b/.test(q) && /\b(customer|customers|buyers)\b/.test(q)) return {kind:"answer",metric:"customers"};
    if (/\b(sales|revenue)\b/.test(q) && !/\b(track|build|create|enable)\b/.test(q)) return {kind:"answer",metric:"sales"};
  }
  // Longest matching phrase owns overlapping aliases: purchase orders != orders.
  const candidates = [
    ...FEATURES.map(f => ({id:f.id,name:f.name,type:"feature" as const,aliases:f.aliases})),
    ...TEMPLATES.map(t => ({id:t.id,name:t.name,type:"template" as const,aliases:t.aliases})),
  ].flatMap(t => t.aliases.filter(a => contains(q,a)).map(a => ({...t,alias:normalize(a)})));
  const matches = candidates.filter(c => !candidates.some(other => other.alias.length > c.alias.length && contains(other.alias,c.alias)))
    .filter((c,i,all) => all.findIndex(x => x.id === c.id) === i).map(({id,name,type}) => ({id,name,type}));
  const activate = /\b(enable|activate|add|build|create|set up|setup|start|need|want|track)\b/.test(q) && !/^(how|what|why|when|where|which|can i|could i|should|do i)\b/.test(q);
  // Custom fields always go through the visible field builder before creation.
  if (/\b(with fields|custom tracker|custom fields)\b/.test(q)) return {kind:"custom",name: customName(input)};
  if (matches.length) return {kind:"tools",matches,activate:activate && matches.length === 1};
  if (activate) return {kind:"custom",name:customName(input)};
  return {kind:"unsupported"};
}
function customName(input:string) {
  return input.replace(/^(please\s+)?(i\s+)?(need|want)\s+(you\s+)?(to\s+)?/i, "")
    .replace(/^(please\s+)?(build|create|add|track|tracking|set up)\s+(a\s+)?(custom\s+)?(tracker\s+(for\s+)?)?/i, "")
    .split(/\bwith fields\b/i)[0].replace(/[<>]/g, "").trim().slice(0,70);
}
