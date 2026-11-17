import { authPage, escapeHtml as e } from "../forms";
import { loginFactorView } from "./store";
import type { MfaAudience } from "./model";
import qrcode from "qrcode-generator";

/** No external QR renderer: the shared secret remains inside this private response. */
export function factorPage(token: string, audience: MfaAudience, action: string, hidden = "", message = "", status = 200) {
  const view = loginFactorView(token, audience);
  let setupImage = "";
  if(view.authenticatorUri) {
    const code=qrcode(0,"M");code.addData(view.authenticatorUri,"Byte");code.make();
    setupImage=`<p>Scan this QR code with your authenticator app.</p><img alt="Authenticator setup QR code" src="${code.createDataURL(5,20)}" width="240" height="240" style="max-width:100%;object-fit:contain">`;
  }
  return authPage(view.enrollmentRequired ? "Set up your authenticator" : "Verify your sign-in", `
    ${message ? `<p role="alert">${e(message)}</p>` : ""}
    ${view.secret ? `${setupImage}<p>Or add a time-based account manually with this setup key:</p><p style="overflow-wrap:anywhere"><code>${e(view.secret)}</code></p><p>Use six-digit codes and a 30-second interval. Keep the key private. Enter the code from your app to finish setup.</p>` : "<p>Enter the current code from your authenticator app, or one unused recovery code.</p>"}
    <form method="post" action="${e(action)}">${hidden}<input type="hidden" name="challenge" value="${e(token)}"><label>Verification code<input name="code" type="text" autocomplete="one-time-code" maxlength="40" required autofocus></label><button>Verify and sign in</button></form>
    <p>This sign-in expires in five minutes. Use the setup key on this page if setup is unfinished. An older page may show a different key.</p><p><a href="${e(action)}">Start a fresh sign-in</a> if verification expires. Refreshing this page starts sign-in again.</p>` , status);
}
export function recoveryPage(codes: string[], destination: string) {
  return authPage("Save your recovery codes", `<p>Your authenticator is ready. Save these codes somewhere private, separate from this device. Each code works once with your account password if you lose your authenticator.</p><pre style="overflow-wrap:anywhere;white-space:pre-wrap">${codes.map(e).join("\n")}</pre><p>They will not be shown again. Using a recovery code signs out your other sessions.</p><p><a href="${e(destination)}">I saved my codes. Continue to my account.</a></p>`);
}
