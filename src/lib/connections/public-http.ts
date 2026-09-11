import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { publicWebsite } from "../ppc/market";
const blocked=new BlockList();
for(const [ip,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.168.0.0",16],["198.18.0.0",15],["224.0.0.0",4],["240.0.0.0",4]] as [string,number][])blocked.addSubnet(ip,prefix);
export function publicAddress(ip:string):boolean {if(isIP(ip)===4)return !blocked.check(ip,"ipv4");return isIP(ip)===6&&/^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(0:|db8:)/i.test(ip);}
/** Resolve once and pin the connection to that public IP. Never follow redirects
 * with API credentials. Response sizes and elapsed time are bounded. */
export async function publicRequest(urlString:string,options:{method?:"GET"|"POST";headers?:Record<string,string>;body?:unknown}={}) {
  const safe=publicWebsite(urlString);if(!safe)throw new Error("Use a public HTTPS endpoint with no username, password or custom port.");
  const url=new URL(safe),addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error("This endpoint does not resolve exclusively to public Internet addresses.");
  const pinned=addresses[0];
  return new Promise<{status:number;body:string;location?:string;contentType?:string}>((resolve,reject)=>{
    const req=request(url,{method:options.method||"GET",headers:{Accept:"application/json",...options.headers,...(options.body?{"Content-Type":"application/json"}:{})},lookup:(_hostname,lookupOptions,cb)=>{if(lookupOptions.all)cb(null,[{address:pinned.address,family:pinned.family}]);else cb(null,pinned.address,pinned.family);}},res=>{
      const chunks:Buffer[]=[];let size=0;
      res.on("data",chunk=>{size+=chunk.length;if(size>1_000_000){req.destroy(new Error("API response exceeds 1 MB."));return;}chunks.push(chunk);});
      res.on("end",()=>resolve({status:res.statusCode||0,body:Buffer.concat(chunks).toString("utf8"),location:res.headers.location,contentType:res.headers["content-type"]}));
      res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("API request timed out.")),15000);
    req.on("close",()=>clearTimeout(timer));req.on("error",reject);
    if(options.body)req.write(JSON.stringify(options.body));req.end();
  });
}
