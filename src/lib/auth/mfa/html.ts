import { authPage, escapeHtml as e } from "../forms";
import { loginFactorView } from "./store";
import type { MfaAudience } from "./model";

/** No external QR renderer: the shared secret remains inside this private response. */
export function factorPage(token: string, audience: MfaAudience, action: string, hidden = "", message = "", status = 200) {
  const view = loginFactorView(token, audience);
  return authPage(view.enrollmentRequired ? "Set up your authenticator" : "Verify your sign-in", `
    ${message ? `<p role="alert">${e(message)}</p>` : ""}
    ${view.secret ? `<p>In your authenticator app, add a time-based account named Shuug. Enter this setup key manually:</p><p style="overflow-wrap:anywhere"><code>${e(view.secret)}</code></p><p>Use six-digit codes and a 30-second interval. Keep the key private. Enter the code from your app to finish setup.</p>` : "<p>Enter the current code from your authenticator app, or one unused recovery code.</p>"}
    <form method="post" action="${e(action)}">${hidden}<input type="hidden" name="challenge" value="${e(token)}"><label>Verification code<input name="code" type="text" autocomplete="one-time-code" maxlength="40" required autofocus></label><button>Verify and sign in</button></form>
    <p>This sign-in expires in five minutes. If it expires, start again with your password.</p>` , status);
}
export function recoveryPage(codes: string[], destination: string) {
  return authPage("Save your recovery codes", `<p>Your authenticator is ready. Save these codes somewhere private, separate from this device. Each code works once with your account password if you lose your authenticator.</p><pre style="overflow-wrap:anywhere;white-space:pre-wrap">${codes.map(e).join("\n")}</pre><p>They will not be shown again. Using a recovery code signs out your other sessions.</p><p><a href="${e(destination)}">I saved my codes. Continue to my account.</a></p>`);
}
