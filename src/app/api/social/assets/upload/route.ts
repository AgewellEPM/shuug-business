import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { storeImage } from "@/lib/social/creative";
export const runtime="nodejs";
export async function POST(request:Request) {
  try{await requireWorkspaceAccess();await requireSectionAccess("marketing","edit");}catch{return Response.json({error:"Owner access required."},{status:403});}
  try{const type=request.headers.get("content-type")??"";if(!type.startsWith("multipart/form-data;"))throw new Error("Choose a product photo or logo.");const reader=request.body?.getReader();if(!reader)throw new Error("Choose an image.");let size=0;const parts:Uint8Array[]=[];const timer=setTimeout(()=>void reader.cancel(),20000);try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>10*1024*1024+65536){await reader.cancel();throw new Error("Choose an image up to 10 MB.");}parts.push(p.value);}}finally{clearTimeout(timer);reader.releaseLock();}const form=await new Response(Buffer.concat(parts),{headers:{"Content-Type":type}}).formData(),file=form.get("file");if(!(file instanceof File))throw new Error("Choose an image.");const asset=storeImage(Buffer.from(await file.arrayBuffer()),file.name);return Response.json({asset},{status:201,headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({error:e instanceof Error?e.message:"Upload failed."},{status:400});}
}
