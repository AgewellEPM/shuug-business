import { z } from "zod";
import { privateHeaders } from "@/lib/rideshare-driver/http";
import { argyleCaller, argyleFailure, argyleInput, createArgyleHandoff, consumeArgyleHandoff } from "@/lib/gig-connections/argyle-http";
import { argyleSummary, createArgyleLink, queueArgyleSync, disconnectArgyle } from "@/lib/gig-connections/argyle-service";
import { argylePage, argyleClientScript } from "@/lib/gig-connections/argyle-html";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{action?:string[]}>};
export async function GET(request:Request,context:Context) {
  try {
    const action=(await context.params).action?.join("/")||"";
    if(action==="handoff")return consumeArgyleHandoff(new URL(request.url).searchParams.get("code")||"");
    const token=argyleCaller(request);
    if(action==="client.js")return new Response(argyleClientScript,{headers:{...privateHeaders,"Content-Type":"text/javascript; charset=utf-8"}});
    if(action && action!=="summary")return Response.json({error:"Not found."},{status:404,headers:privateHeaders});
    const data=argyleSummary(token);
    return action==="summary"||request.headers.get("accept")?.includes("application/json")?Response.json(data,{headers:privateHeaders}):argylePage(data);
  } catch(error){return argyleFailure(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    const token=argyleCaller(request,true),action=(await context.params).action?.join("/")||"",input=await argyleInput(request);
    if(action==="disconnect"){z.object({confirm:z.literal(true)}).strict().parse(input);return Response.json(await disconnectArgyle(token),{headers:privateHeaders});}
    z.object({}).strict().parse(input);
    if(action==="link")return Response.json(await createArgyleLink(token),{headers:privateHeaders});
    if(action==="sync")return Response.json(queueArgyleSync(token),{status:202,headers:privateHeaders});
    if(action==="handoff")return Response.json(createArgyleHandoff(token),{headers:privateHeaders});
    return Response.json({error:"Not found."},{status:404,headers:privateHeaders});
  }catch(error){return argyleFailure(error);}
}
