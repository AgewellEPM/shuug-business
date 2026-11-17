import { ownerClientScript } from "@/lib/auth/social/owner-client";
export function GET() {return new Response(ownerClientScript,{headers:{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});}
