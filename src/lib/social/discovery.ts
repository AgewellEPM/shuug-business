import { randomUUID } from "node:crypto";
import { publicRequest } from "../connections/public-http";
import { publicWebsite } from "../ppc/market";
import { accountSchema, type BrandDiscovery, type DiscoveredProfile, type DiscoveredProduct } from "./model";
import { changeSocial } from "./store";

export function normalizeLink(raw:string):string {
  const safe=publicWebsite(raw.trim());
  if(!safe||safe.length>2000)throw new Error("Drop a public website or social profile URL, such as instagram.com/yourbrand.");
  const url=new URL(safe);url.hash="";return url.href;
}
/** Exact host and profile paths only: sharing links and individual posts are not profiles. */
export function socialProfile(raw:string,source=raw):DiscoveredProfile|null {
  let u:URL;try{u=new URL(normalizeLink(raw));}catch{return null;}
  const host=u.hostname.toLowerCase().replace(/^(www|m)\./,""),p=u.pathname.split("/").filter(Boolean);
  const result=(platform:DiscoveredProfile["platform"],handle:string,url:string):DiscoveredProfile=>({platform,handle,url,source});
  const username=(s:string|undefined)=>!!s&&/^[a-zA-Z0-9_.-]{1,100}$/.test(s);
  if(host==="instagram.com"&&p.length===1&&username(p[0])&&!/^(p|reel|reels|stories|explore|accounts|direct|about|share|developer)$/i.test(p[0]))return result("instagram",p[0],`https://www.instagram.com/${p[0]}/`);
  if(["facebook.com","fb.com"].includes(host)) {
    if(p[0]==="profile.php"&&/^\d+$/.test(u.searchParams.get("id")||""))return result("facebook",u.searchParams.get("id")!,`https://www.facebook.com/profile.php?id=${u.searchParams.get("id")}`);
    if(p.length===1&&username(p[0])&&!/^(share|sharer|sharer.php|dialog|login|watch|reel|groups|events|help|privacy|marketplace)$/i.test(p[0]))return result("facebook",p[0],`https://www.facebook.com/${p[0]}`);
    if(p[0]==="people"&&p.length===3&&/^\d+$/.test(p[2]))return result("facebook",p[2],`https://www.facebook.com/people/${p[1]}/${p[2]}`);
  }
  if(host==="tiktok.com"&&p.length===1&&/^@[\w.]{1,30}$/.test(p[0]))return result("tiktok",p[0].slice(1),`https://www.tiktok.com/${p[0]}`);
  if(host==="youtube.com") {
    if(p.length===1&&/^@[\w.-]{1,100}$/.test(p[0]))return result("youtube",p[0],`https://www.youtube.com/${p[0]}`);
    if(p.length===2&&p[0]==="channel"&&/^UC[\w-]{20,30}$/.test(p[1]))return result("youtube",p[1],`https://www.youtube.com/channel/${p[1]}`);
  }
  if(host==="linkedin.com"&&p.length===2&&["company","in"].includes(p[0])&&username(p[1]))return result("linkedin",p[1],`https://www.linkedin.com/${p[0]}/${p[1]}/`);
  if(["pinterest.com","pinterest.co.uk"].includes(host)&&p.length===1&&username(p[0])&&!/^(pin|search|ideas|business|login)$/i.test(p[0]))return result("pinterest",p[0],`https://www.pinterest.com/${p[0]}/`);
  if(["x.com","twitter.com"].includes(host)&&p.length===1&&/^[\w]{1,15}$/.test(p[0])&&!/^(intent|share|home|search|explore|i|settings|login|tos|privacy)$/i.test(p[0]))return result("x",p[0],`https://x.com/${p[0]}`);
  if(["threads.net","threads.com"].includes(host)&&p.length===1&&/^@[\w.]{1,30}$/.test(p[0]))return result("threads",p[0].slice(1),`https://www.threads.com/${p[0]}`);
  if(host==="bsky.app"&&p.length===2&&p[0]==="profile"&&/^[\w.-]+\.[a-z]{2,}$/i.test(p[1]))return result("bluesky",p[1],`https://bsky.app/profile/${p[1]}`);
  return null;
}
export function isSocialHost(raw:string){const host=new URL(raw).hostname.replace(/^(www|m)\./,"");return /^(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|pinterest\.(com|co\.uk)|x\.com|twitter\.com|threads\.(net|com)|bsky\.app)$/.test(host);}
function decode(s:string){return s.replace(/&(?:amp|quot|apos|lt|gt|#39|#x27|#\d+);/gi,m=>({"&amp;":"&","&quot;":"\"","&apos;":"'","&lt;":"<","&gt;":">","&#39;":"'","&#x27;":"'"}[m.toLowerCase()]??String.fromCodePoint(Math.min(0x10ffff,Number(m.slice(2,-1))))));}
function clean(s:unknown,max=2500){return typeof s==="string"?decode(s.replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim().slice(0,max):"";}
function attributes(tag:string){return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));}
export function parseWebsite(html:string,url:string):Omit<BrandDiscovery,"at"|"warnings"> & {pages:string[]} {
  const links=new Set<string>(),pages=new Set<string>(),products:DiscoveredProduct[]=[],meta:Record<string,string>={};
  const absolute=(raw:unknown)=>{try{if(typeof raw!=="string")return "";return normalizeLink(new URL(decode(raw),url).href);}catch{return "";}};
  for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a=attributes(match[0]);if(a.content)meta[a.property||a.name]=a.content;}
  for(const match of html.matchAll(/<a\b[^>]*>/gi)){const a=attributes(match[0]),href=absolute(a.href);if(!href)continue;links.add(href);if(new URL(href).origin===new URL(url).origin&&/^\/(?:pages\/)?(?:about(?:-us)?|contact(?:-us)?)\/?$/.test(new URL(href).pathname))pages.add(href);}
  let organizationName="",organizationDescription="",visited=0;
  function walk(value:unknown){if(++visited>3000||!value||typeof value!=="object")return;if(Array.isArray(value)){value.slice(0,200).forEach(walk);return;}const v=value as Record<string,unknown>,types=Array.isArray(v["@type"])?v["@type"]:[v["@type"]];
    if(types.some(t=>["Organization","Store","Brand","LocalBusiness","Corporation"].includes(String(t)))){organizationName||=clean(v.name,100);organizationDescription||=clean(v.description);const same=Array.isArray(v.sameAs)?v.sameAs:[v.sameAs];same.forEach(s=>{const link=absolute(s);if(link)links.add(link);});}
    if(types.includes("Product")&&products.length<30){const image=Array.isArray(v.image)?v.image[0]:v.image,name=clean(v.name,180);if(name)products.push({name,url:absolute(v.url)||url,imageUrl:absolute(typeof image==="object"&&image? (image as Record<string,unknown>).url:image),description:clean(v.description,1000)});}
    Object.values(v).forEach(walk);
  }
  for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(match[1]));}catch{/* Invalid structured data does not block profile discovery. */}}
  const profiles=new Map<string,DiscoveredProfile>();for(const link of links){const p=socialProfile(link,url);if(p)profiles.set(`${p.platform}/${p.handle.toLowerCase()}`,p);}
  return {url,name:clean(meta["og:site_name"]||organizationName||meta["og:title"]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname,100),description:clean(meta.description||meta["og:description"]||organizationDescription),profiles:[...profiles.values()].slice(0,30),products,pages:[...pages].slice(0,2)};
}
async function publicPage(start:string){let url=normalizeLink(start);for(let hop=0;hop<4;hop++) {const response=await publicRequest(url,{headers:{Accept:"text/html, application/xhtml+xml", "User-Agent":"ShuugBusiness/1.0 (brand profile discovery)"}});if([301,302,303,307,308].includes(response.status)&&response.location){url=normalizeLink(new URL(response.location,url).href);continue;}if(response.status<200||response.status>=300)throw new Error(`The website returned ${response.status}. You can still drop its social profile links directly.`);if(response.contentType&&!/text\/html|application\/xhtml\+xml/i.test(response.contentType))throw new Error("This URL does not return a website page.");return {url,html:response.body};}throw new Error("This website redirected too many times. Paste its final website address.");}
export async function discoverLink(raw:string):Promise<BrandDiscovery> {
  const url=normalizeLink(raw),profile=socialProfile(url),at=new Date().toISOString();
  if(profile)return {url:profile.url,at,name:profile.handle.replace(/^@/,""),description:"",profiles:[profile],products:[],warnings:["Profile found from its URL. Private analytics require the account owner's connection; public counts appear after a supported refresh."]};
  if(isSocialHost(url))throw new Error("Drop the account's profile link, rather than a post, video, share or sign-in link.");
  const page=await publicPage(url),parsed=parseWebsite(page.html,page.url),warnings:string[]=[];
  for(const extra of parsed.pages){try{const p=await publicPage(extra),more=parseWebsite(p.html,p.url);for(const profile of more.profiles)if(!parsed.profiles.some(v=>v.platform===profile.platform&&v.handle.toLowerCase()===profile.handle.toLowerCase()))parsed.profiles.push(profile);}catch{warnings.push("An about/contact page could not be read. Drop any missing social links below.");}}
  if(!parsed.profiles.length)warnings.push("No public social profile links were found on this website. Drop the profile URLs directly to add them.");
  if(!parsed.products.length)warnings.push("No product structured data was found. Campaigns can use your workspace products or a product name you enter.");
  warnings.push("Website text and product names are discovered suggestions. Review them before approving campaign content.");
  return {url:parsed.url,at,name:parsed.name,description:parsed.description,profiles:parsed.profiles.slice(0,30),products:parsed.products,warnings};
}
export function saveDiscovery(discovery:BrandDiscovery,role:"brand"|"competitor") {
  return changeSocial(s=>{
    const added:string[]=[],existing:string[]=[];
    for(const profile of discovery.profiles){const prior=s.accounts.find(a=>!a.disabled&&a.platform===profile.platform&&a.handle.toLowerCase()===profile.handle.toLowerCase());if(prior){existing.push(prior.id);continue;}if(s.accounts.length>=100)throw new Error("This workspace supports up to 100 profiles.");
      const account=accountSchema.parse({id:randomUUID(),platform:profile.platform,label:profile.handle,handle:profile.handle,role,method:"api",profileUrl:profile.url,revision:1,disabled:false,createdAt:discovery.at});s.accounts.push(account);added.push(account.id);
    }
    if(role==="brand"){
      const website=!socialProfile(discovery.url);if(website&&!s.brand.website){s.brand.website=discovery.url;s.brand.name=discovery.name;s.brand.description=discovery.description;s.brandRevision++;}
      const platforms=[...new Set(s.accounts.filter(a=>a.role==="brand"&&!a.disabled).map(a=>a.platform))];if(added.length&&platforms.length&&JSON.stringify(platforms)!==JSON.stringify(s.brand.platforms)){s.brand.platforms=platforms;s.brandRevision++;}
      s.discoveries??=[];s.discoveries=s.discoveries.filter(d=>d.url!==discovery.url);s.discoveries.push(discovery);
    }
    return {added,existing};
  });
}
