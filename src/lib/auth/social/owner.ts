import { authPage } from "../forms";
import { configuredProviders } from "./providers";
import { secureStaffIdentity } from "../../secure-tax/staff-session";
import { workspaceDatabase } from "../../workspace/database";
import { SESSION_COOKIE } from "../config";
import { linkedSocialProviders } from "./store";
export function ownerSocialControls(purpose: "login" | "link", linked:string[]=[]) {
  const providers = configuredProviders();
  const buttons = (["google", "apple"] as const).filter(provider => providers[provider]).map(provider => `<button type="button" data-social-provider="${provider}" data-social-purpose="${purpose==='link'&&linked.includes(provider)?'unlink':purpose}">${purpose === "link" ? linked.includes(provider)?"Disconnect":"Connect" : "Continue with"} ${provider === "google" ? "Google" : "Apple"}</button>`).join("");
  return buttons ? `<section id="social-signin">${buttons}<p id="social-status" role="status"></p><div id="social-factor"></div></section><script src="/api/auth/social/owner-client" defer></script>` : "";
}
export function ownerSocialManage(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  try {
    const {user} = workspaceDatabase(db => secureStaffIdentity(db, token));
    if (!user.isOwner) throw new Error("Owner required");
    const controls = ownerSocialControls("link",linkedSocialProviders("owner",token));
    return authPage("Your sign-in methods", `<p>Connect your own Google or Apple account after this verified owner sign-in. Connecting never matches or merges accounts by email. Your authenticator remains required.</p>${controls || "<p>Google and Apple sign-in are still being configured.</p>"}<p><a href="/">Back to your business dashboard</a></p>`);
  } catch { return authPage("Sign in first", '<p>Use your current owner sign-in before connecting another sign-in method.</p><p><a href="/api/auth/login">Open owner sign-in</a></p>', 401); }
}
