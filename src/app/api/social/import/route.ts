import { requireSectionAccess } from "@/lib/permissions/guard";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { boundedJson } from "@/lib/social/http";
import { importSnapshot } from "@/lib/social/import";
import { readSocial,saveSnapshot } from "@/lib/social/store";
export async function POST(request:Request){try{await requireWorkspaceAccess();await requireSectionAccess("marketing","edit");}catch{return Response.json({error:"Owner access required."},{status:403});}try{const raw=await boundedJson(new Response(request.body),750000),snapshot=importSnapshot(raw as Parameters<typeof importSnapshot>[0]),account=readSocial().accounts.find(a=>a.id===snapshot.accountId)!;return Response.json({imported:saveSnapshot(snapshot,account.revision),accountId:account.id},{headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({error:e instanceof Error?e.message:"Invalid report."},{status:400});}}
