import { requireOwnerAccess } from "@/lib/auth/identity";
import { checkArgyleAccess, registerArgyleWebhooks } from "@/lib/gig-connections/argyle-setup";
import { recoverArgyleUsers } from "@/lib/gig-connections/argyle-service";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { driverProviderSetup, saveDriverProviderSetup, bankReturnUri } from "@/lib/rideshare-driver/provider-setup";
import { retryBankRevocations } from "@/lib/rideshare-driver/bank-store";
export const dynamic = "force-dynamic";
async function retryRevocations() {
  "use server";
  await requireSectionAccess("admin", "edit"); await retryBankRevocations(); revalidatePath("/setup/driver-connections");
}
async function save(form: FormData) {
  "use server";
  await requireSectionAccess("admin", "edit");
  const provider = form.get("provider");
  try {
    if (provider === "argyle") {
      await requireOwnerAccess();
      saveDriverProviderSetup({provider,environment:String(form.get("environment")),apiKeyId:String(form.get("apiKeyId")??""),apiKeySecret:String(form.get("apiKeySecret")??""),enabled:form.get("enabled")==="on",lookbackDays:366});
    } else if (provider === "googleRoutes") {
      await requireOwnerAccess();
      saveDriverProviderSetup({ provider, serverKey: String(form.get("serverKey") ?? ""), liveEnabled: form.get("liveEnabled") === "on" });
    } else {
    if (provider !== "plaid" && provider !== "uber") throw new Error("Choose an available provider.");
    saveDriverProviderSetup(provider === "plaid" ? {
      provider, environment: String(form.get("environment")), clientId: String(form.get("clientId") ?? ""), secret: String(form.get("secret") ?? ""),
      redirectUri: bankReturnUri, iosAppId: String(form.get("iosAppId") ?? ""), liveEnabled: form.get("liveEnabled") === "on", associationVerified: form.get("associationVerified") === "on",
    } : { provider: "uber", clientId: String(form.get("clientId") ?? ""), secret: String(form.get("secret") ?? ""), approved: form.get("approved") === "on" });
    }
  } catch { redirect("/setup/driver-connections?result=invalid"); }
  revalidatePath("/setup/driver-connections"); redirect("/setup/driver-connections?result=saved");
}
async function argyleAction(form:FormData) {
  "use server";
  await requireOwnerAccess();
  let result="argyle-error";
  try {
    if(form.get("operation")==="check") {await checkArgyleAccess();result="argyle-checked";}
    if(form.get("operation")==="register") {await registerArgyleWebhooks();result="argyle-registered";}
    if(form.get("operation")==="recover") {const recovered=await recoverArgyleUsers();result=recovered.needsReview?"argyle-review":"argyle-recovered";}
  } catch {}
  revalidatePath("/setup/driver-connections");redirect(`/setup/driver-connections?result=${result}`);
}
export default async function DriverConnectionSetup({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  await requireSectionAccess("admin", "view");
  const status = driverProviderSetup(), result = (await searchParams).result;
  const input = "mt-1 w-full rounded border p-2";
  return <div className="max-w-3xl space-y-6">
    <header><p className="dd-eyebrow">Owner setup</p><h1 className="text-2xl font-bold">Driver app connections</h1><p>Configure maps and approved account providers. Each client separately authorizes their own account; these settings do not connect a client&apos;s bank or gig account.</p></header>
    {result?.startsWith("argyle-") && <p role="status">{result==="argyle-checked"?"Argyle API access verified. A client account still needs to connect.":result==="argyle-registered"?"Signed account-update webhooks registered.":result==="argyle-recovered"?"Interrupted account setups checked and any unique matching users restored.":result==="argyle-review"?"Some interrupted setups need review in Argyle Console; no duplicate provider users were created.":"The provider check did not finish. Check the keys, environment, HTTPS address and Argyle Console."}</p>}
    {result && !result.startsWith("argyle-") && <p role="status" className="rounded border p-4">{result === "saved" ? "Provider settings saved securely." : "Settings were not saved. Check the fields; existing banks must be disconnected before changing the provider application, and pending links must finish or be canceled."}</p>}
    <section className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">1 · Bank transactions through Plaid</h2><p>{status.bank.reason}</p>
      {status.bank.pendingRevocations > 0 && <div className="rounded border border-amber-300 p-4"><p>{status.bank.pendingRevocations} canceled bank authorizations still need provider revocation. Cleanup credentials are encrypted and retained separately for retry.</p><form action={retryRevocations}><button className="rounded border px-4 py-2">Retry pending bank revocations</button></form></div>}
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="plaid"/>
        <label className="block">Environment<select name="environment" defaultValue={status.bank.environment} className={input}><option value="sandbox">Sandbox · test institutions</option><option value="production">Production · approved live access</option></select></label>
        <label className="block">Plaid client ID<input name="clientId" autoComplete="off" placeholder={status.bank.clientIdConfigured ? "Saved · leave blank to retain" : "From your Plaid dashboard"} className={input}/></label>
        <label className="block">Plaid secret<input name="secret" type="password" autoComplete="new-password" placeholder={status.bank.secretConfigured ? "Saved · leave blank to retain" : "Environment-specific secret"} className={input}/></label>
        <p>Register this exact iPhone return URI in Plaid: <code>{bankReturnUri}</code></p>
        <label className="block">Signed iPhone application identifier<input name="iosAppId" defaultValue={status.bank.iosAppId} placeholder="Actual prefix.com.ridesharetaxpros.driver" className={input}/></label>
        <p className="text-sm">Publish this actual identifier as <code>iosAppId</code> in the website&apos;s public configuration and deploy it. The website build serves the app association for <code>/bank-return</code>. Confirm it matches the signed physical app.</p>
        <label className="block"><input type="checkbox" name="associationVerified" defaultChecked={status.bank.associationVerified}/> I verified the published app association and signed iPhone return link.</label>
        <label className="block"><input type="checkbox" name="liveEnabled" defaultChecked={status.bank.liveEnabled}/> Enable approved production bank linking for consenting clients.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save bank provider settings</button>
      </form>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">2 · Uber driver account</h2><p>Driver profile, trips and payment information require Uber&apos;s approved Driver API application and each driver&apos;s authorization.</p>
      <p>Register this exact backend callback with Uber: <code>{status.uber.callbackUri}</code>{!status.uber.publicWorkspace && <strong className="block">Deploy the public HTTPS workspace before enabling driver authorization.</strong>}</p>
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="uber"/>
        <label className="block">Uber Driver API client ID<input name="clientId" autoComplete="off" placeholder={status.uber.clientIdConfigured ? "Saved · leave blank to retain" : "From the approved Uber application"} className={input}/></label>
        <label className="block">Uber Driver API client secret<input name="secret" type="password" autoComplete="new-password" placeholder={status.uber.secretConfigured ? "Saved · leave blank to retain" : "Application secret"} className={input}/></label>
        <label className="block"><input type="checkbox" name="approved" defaultChecked={status.uber.approved}/> Uber approved this application for the requested Driver API scopes.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save Uber provider settings</button>
      </form>
    </section>
    <section id="argyle" className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">3 · Gig accounts through Argyle</h2>
      <p>Connect each client&apos;s own work accounts. Receive available job, pay, rating and vehicle records automatically. Incoming offers and second-by-second updates must be confirmed separately for each platform.</p>
      <p>{status.argyle.ready?"Provider settings are ready for an account connection.":"Finish the provider settings and public HTTPS workspace first."}</p>
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="argyle"/>
        <label className="block">Environment<select name="environment" defaultValue={status.argyle.environment} className={input}><option value="sandbox">Sandbox · sample records only</option><option value="production">Production · actual consenting accounts</option></select></label>
        <label className="block">API key ID<input name="apiKeyId" autoComplete="off" placeholder={status.argyle.apiKeyIdConfigured?"Saved · leave blank to retain":"From your Argyle Console"} className={input}/></label>
        <label className="block">API key secret<input type="password" name="apiKeySecret" autoComplete="new-password" placeholder={status.argyle.apiKeySecretConfigured?"Saved · leave blank to retain":"Never put this key in chat or the public website"} className={input}/></label>
        <label className="block"><input name="enabled" type="checkbox" defaultChecked={status.argyle.enabled}/> Enable account connections with these keys.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save Argyle settings privately</button>
      </form>
      <p>Signed webhook address: <code>{status.argyle.webhookUrl}</code></p>
      <form action={argyleAction}><input type="hidden" name="operation" value="check"/><button>Check Argyle API access</button></form>
      <form action={argyleAction}><input type="hidden" name="operation" value="register"/><button>Register signed account-update webhooks</button></form>
      <form action={argyleAction}><input type="hidden" name="operation" value="recover"/><button>Check interrupted account setups</button></form>
      <p>Webhooks: {status.argyle.subscriptionConfigured?"Registered":"Not yet registered"}. Automatic worker: {status.argyle.workerRunning?"Running":"Not detected"}.</p>
    </section>
    <section id="google-routes" className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">4 · Google Maps route comparisons</h2>
      <p>Opening the Google Maps app for directions needs no API key. Automatic route and travel-time comparisons use Google Maps Platform and its billing-enabled Routes API.</p>
      <p>{status.googleRoutes.ready ? "Server route lookups are enabled. Verify a real route with the configured Android app before relying on the connection." : "Server route lookups are not enabled."}</p>
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="googleRoutes"/>
        <label className="block">Dedicated driver Routes API server key<input name="serverKey" type="password" autoComplete="new-password" placeholder={status.googleRoutes.serverKeyConfigured ? "Saved · leave blank to retain" : "From your Google Cloud project"} className={input}/></label>
        <p>This private server key stays in the workspace vault. The Android build uses its own Android-restricted Maps SDK key; the app displays these routes on Google Maps.</p>
        <label className="block"><input name="liveEnabled" type="checkbox" defaultChecked={status.googleRoutes.enabled}/> Enable authenticated driver route lookups with this project&apos;s Google Maps billing and quotas.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save Google Maps settings privately</button>
      </form>
      <a className="underline" href="https://developers.google.com/maps/documentation/routes/get-api-key" target="_blank" rel="noreferrer">Google Routes API setup</a>
    </section>
    <section className="rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">5 · Verify a consenting client&apos;s connection</h2><p>Use an invited client account in the app and portal. Verify the correct client receives their provider records, verify staff access, then verify disconnecting revokes access. A saved credential or approval checkbox does not prove a live customer connection.</p><Link className="underline" href="/setup/customers">Client invitations</Link> · <Link className="underline" href="/rideshare">Driver records</Link></section>
  </div>;
}
