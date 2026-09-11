import { requireSectionAccess } from "@/lib/permissions/guard";
import { readFile } from "node:fs/promises";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { assetPath,checksum,readSocial } from "@/lib/social/store";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {try{await requireWorkspaceAccess();await requireSectionAccess("marketing","view");}catch{return new Response("Owner access required",{status:403});}try{const id=(await params).id,asset=readSocial().assets.find(a=>a.id===id);if(!asset)return new Response("Image not found",{status:404});const bytes=await readFile(assetPath(asset));if(checksum(bytes)!==asset.hash)throw new Error("Image changed.");return new Response(bytes,{headers:{"Content-Type":asset.mime,"Content-Length":String(bytes.length),"Content-Disposition":`${new URL(request.url).searchParams.has("download")?"attachment":"inline"}; filename="social-${asset.id}.${asset.extension}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});}catch{return new Response("Image unavailable",{status:404});}}
