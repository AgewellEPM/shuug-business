import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID,createHash } from "node:crypto";
import { existsSync,readFileSync,writeFileSync,mkdirSync } from "node:fs";
import path from "node:path";
import { setting,dataDirectory } from "@/lib/connections/vault";
import { equalSecret } from "@/lib/connections/access";
import { updateVisits } from "@/lib/visits/store";
import { prospectSchema } from "@/lib/visits/model";
export async function POST(request:Request){const token=setting("AUTOMATION_INBOUND_TOKEN");if(!token||!equalSecret(request.headers.get("authorization")||"",`Bearer ${token}`))return NextResponse.json({error:"Unauthorized"},{status:401});
  const idempotency=request.headers.get("idempotency-key");if(!idempotency||!/^[A-Za-z0-9_-]{8,120}$/.test(idempotency))return NextResponse.json({error:"Send an Idempotency-Key of 8–120 letters, digits, underscores or hyphens."},{status:400});
  if(Number(request.headers.get("content-length"))>16000)return NextResponse.json({error:"Payload too large"},{status:413});
  const text=await request.text();if(text.length>16000)return NextResponse.json({error:"Payload too large"},{status:413});
  try{const body=z.object({type:z.literal("prospect.create"),data:prospectSchema.pick({name:true,address:true,phone:true,decisionMaker:true,role:true,email:true,notes:true}).partial().extend({name:z.string().trim().min(1).max(160)})}).parse(JSON.parse(text));const folder=path.join(dataDirectory(),"inbound-events");mkdirSync(folder,{recursive:true,mode:0o700});const file=path.join(folder,createHash("sha256").update(idempotency).digest("hex")+".json"),digest=createHash("sha256").update(text).digest("hex");
    if(existsSync(file)){const receipt=JSON.parse(readFileSync(file,"utf8"));return receipt.digest===digest?NextResponse.json(receipt.response):NextResponse.json({error:"Idempotency key already used for a different payload."},{status:409});}
    const now=new Date().toISOString(),prospect=prospectSchema.parse({id:randomUUID(),placeId:null,...body.data,createdAt:now,updatedAt:now});const response={ok:true,prospectId:prospect.id};
    // Claim before local mutation; the same key cannot create a second prospect.
    writeFileSync(file,JSON.stringify({digest,response:{ok:false,error:"Event processing. Check the prospect list before resubmitting."}}),{flag:"wx",mode:0o600});updateVisits(data=>data.prospects.push(prospect));writeFileSync(file,JSON.stringify({digest,response}),{mode:0o600});return NextResponse.json(response,{status:201});
  }catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0]?.message:"Invalid or incomplete event. Use a new key only after checking the prospect list."},{status:400});}}
