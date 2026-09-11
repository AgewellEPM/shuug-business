import { askAssistantAction } from "@/app/copilot/actions";
import { requireOwnerAccess } from "@/lib/auth/identity";
export async function POST(request:Request) {
  try { await requireOwnerAccess(); } catch { return Response.json({error:"Owner workspace access required."},{status:403}); }
  // Stream-bounded even when content-length is absent.
  const reader=request.body?.getReader();if(!reader)return Response.json({error:"A request is required."},{status:400});
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>8192){await reader.cancel();return Response.json({error:"Request exceeds 8 KB."},{status:413});}chunks.push(value);}
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(typeof body.question!=="string"||!body.question.trim()||body.question.length>1000)return Response.json({error:"Enter a request of up to 1,000 characters."},{status:400});
    return Response.json(await askAssistantAction(body.question),{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"The request could not be read."},{status:400});}
  finally {reader.releaseLock();}
}
