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
    if (provider !== "plaid" && provider !== "uber") throw new Error("Choose an available provider.");
    saveDriverProviderSetup(provider === "plaid" ? {
      provider, environment: String(form.get("environment")), clientId: String(form.get("clientId") ?? ""), secret: String(form.get("secret") ?? ""),
      redirectUri: bankReturnUri, iosAppId: String(form.get("iosAppId") ?? ""), liveEnabled: form.get("liveEnabled") === "on", associationVerified: form.get("associationVerified") === "on",
    } : { provider: "uber", clientId: String(form.get("clientId") ?? ""), secret: String(form.get("secret") ?? ""), approved: form.get("approved") === "on" });
  } catch { redirect("/setup/driver-connections?result=invalid"); }
  revalidatePath("/setup/driver-connections"); redirect("/setup/driver-connections?result=saved");
}
export default async function DriverConnectionSetup({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  await requireSectionAccess("admin", "view");
  const status = driverProviderSetup(), result = (await searchParams).result;
  const input = "mt-1 w-full rounded border p-2";
  return <div className="max-w-3xl space-y-6">
    <header><p className="dd-eyebrow">Owner setup</p><h1 className="text-2xl font-bold">Driver account connections</h1><p>Configure the approved provider applications. Each client separately authorizes their own account; these settings do not connect a client's bank or gig account.</p></header>
    {result && <p role="status" className="rounded border p-4">{result === "saved" ? "Provider settings saved securely." : "Settings were not saved. Check the fields; existing banks must be disconnected before changing the provider application, and pending links must finish or be canceled."}</p>}
    <section className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">1 · Bank transactions through Plaid</h2><p>{status.bank.reason}</p>
      {status.bank.pendingRevocations > 0 && <div className="rounded border border-amber-300 p-4"><p>{status.bank.pendingRevocations} canceled bank authorizations still need provider revocation. Cleanup credentials are encrypted and retained separately for retry.</p><form action={retryRevocations}><button className="rounded border px-4 py-2">Retry pending bank revocations</button></form></div>}
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="plaid"/>
        <label className="block">Environment<select name="environment" defaultValue={status.bank.environment} className={input}><option value="sandbox">Sandbox · test institutions</option><option value="production">Production · approved live access</option></select></label>
        <label className="block">Plaid client ID<input name="clientId" autoComplete="off" placeholder={status.bank.clientIdConfigured ? "Saved · leave blank to retain" : "From your Plaid dashboard"} className={input}/></label>
        <label className="block">Plaid secret<input name="secret" type="password" autoComplete="new-password" placeholder={status.bank.secretConfigured ? "Saved · leave blank to retain" : "Environment-specific secret"} className={input}/></label>
        <p>Register this exact iPhone return URI in Plaid: <code>{bankReturnUri}</code></p>
        <label className="block">Signed iPhone application identifier<input name="iosAppId" defaultValue={status.bank.iosAppId} placeholder="Actual prefix.com.ridesharetaxpros.driver" className={input}/></label>
        <p className="text-sm">Publish this actual identifier as <code>iosAppId</code> in the website's public configuration and deploy it. The website build serves the app association for <code>/bank-return</code>. Confirm it matches the signed physical app.</p>
        <label className="block"><input type="checkbox" name="associationVerified" defaultChecked={status.bank.associationVerified}/> I verified the published app association and signed iPhone return link.</label>
        <label className="block"><input type="checkbox" name="liveEnabled" defaultChecked={status.bank.liveEnabled}/> Enable approved production bank linking for consenting clients.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save bank provider settings</button>
      </form>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">2 · Uber driver account</h2><p>Driver profile, trips and payment information require Uber's approved Driver API application and each driver's authorization.</p>
      <p>Register this exact backend callback with Uber: <code>{status.uber.callbackUri}</code>{!status.uber.publicWorkspace && <strong className="block">Deploy the public HTTPS workspace before enabling driver authorization.</strong>}</p>
      <form action={save} className="space-y-4"><input type="hidden" name="provider" value="uber"/>
        <label className="block">Uber Driver API client ID<input name="clientId" autoComplete="off" placeholder={status.uber.clientIdConfigured ? "Saved · leave blank to retain" : "From the approved Uber application"} className={input}/></label>
        <label className="block">Uber Driver API client secret<input name="secret" type="password" autoComplete="new-password" placeholder={status.uber.secretConfigured ? "Saved · leave blank to retain" : "Application secret"} className={input}/></label>
        <label className="block"><input type="checkbox" name="approved" defaultChecked={status.uber.approved}/> Uber approved this application for the requested Driver API scopes.</label>
        <button className="rounded bg-purple-700 px-4 py-2 text-white">Save Uber provider settings</button>
      </form>
    </section>
    <section className="rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">3 · Verify a consenting client's connection</h2><p>Use an invited client account in the app and portal. Verify the correct client receives their provider records, verify staff access, then verify disconnecting revokes access. A saved credential or approval checkbox does not prove a live customer connection.</p><Link className="underline" href="/setup/customers">Client invitations</Link> · <Link className="underline" href="/rideshare">Driver records</Link></section>
  </div>;
}
