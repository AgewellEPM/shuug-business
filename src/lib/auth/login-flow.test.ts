// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {NextRequest} from "next/server";
import {importBusinessTemplate} from "../branding/templates";
import {gigTaxProsTemplate} from "../industry/rideshare-tax-pros";
import {configureOwnerPassword,ownerSessionValid} from "./owner-session";
import {totp} from "./mfa/crypto";
import {GET,POST} from "@/app/api/auth/login/route";
import {proxy} from "@/proxy";

const jar=vi.hoisted(()=>new Map<string,string>());
vi.mock("next/headers",()=>({cookies:async()=>({get:(name:string)=>jar.has(name)?{value:jar.get(name)}:undefined,set:(name:string,value:string)=>jar.set(name,value),delete:(name:string)=>jar.delete(name)})}));
const base="https://workspace.example.com",password="Synthetic owner MFA flow password";
let directory:string;
beforeEach(()=>{
 directory=mkdtempSync(`${tmpdir()}/gigtax-owner-flow-`);jar.clear();
 for(const [key,value] of Object.entries({DEALDESK_DATA_DIR:directory,DATABASE_URL:"",DEMO_DATA:"false",APP_BASE_URL:base,SHUUG_REQUIRE_MFA:"true",AUTH_ENABLED:"true"}))vi.stubEnv(key,value);
 importBusinessTemplate(gigTaxProsTemplate);configureOwnerPassword(password);
});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
const post=(form:Record<string,string>)=>POST(new Request(base+"/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(form)}));
it("keeps an open tab valid when another login tab opens and admits the completed MFA session through the real proxy",async()=>{
 const first=await (await GET()).text(),csrf=first.match(/name="csrf" value="([a-f0-9]+)"/)![1];
 await GET();expect(jar.get("owner_login_csrf")).toBe(csrf);
 const factor=await post({csrf,password});expect(factor.status).toBe(200);const html=await factor.text();
 expect(html).toContain('alt="Authenticator setup QR code"');expect(html).toContain('src="data:image/gif;base64,');
 const challenge=html.match(/name="challenge" value="([a-f0-9]+)"/)![1],secret=html.match(/<code>([A-Z2-7]{32})<\/code>/)![1];
 const complete=await post({csrf,challenge,code:totp(secret,Math.floor(Date.now()/30000))});expect(complete.status).toBe(200);expect(await complete.text()).toContain("Save your recovery codes");
 const token=jar.get("dd_session")!;expect(ownerSessionValid(token)).toBe(true);
 const response=proxy(new NextRequest(base+"/",{headers:{Cookie:`dd_session=${token}`}}));expect(response.headers.get("location")).toBeNull();expect(response.headers.get("x-middleware-next")).toBe("1");
});
it("gives a recoverable expiry page without accepting a missing CSRF token or looping silently",async()=>{
 await GET();const denied=await post({csrf:"wrong",password});expect(denied.status).toBe(403);expect(await denied.text()).toContain("Open a fresh sign-in form");
 const expired=await post({csrf:jar.get("owner_login_csrf")!,challenge:"a".repeat(64),code:"123456"});expect(expired.status).toBe(401);expect(await expired.text()).toContain("Verification expired");expect(jar.has("dd_session")).toBe(false);
});
