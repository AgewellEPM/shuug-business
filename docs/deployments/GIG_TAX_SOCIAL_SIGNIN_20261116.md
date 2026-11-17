# Gig Tax Pros social sign-in candidate

Google and Apple identity authentication is an additional entry method for an
existing, explicitly linked owner or opaque private customer account. It does
not match accounts by email, create a customer without a firm invitation, replace
the account authenticator, or recover a customer encryption key. The current
owner must complete the existing initial MFA setup before connecting providers.

The backend uses the official authorization-code flows, pinned provider token
and JWKS endpoints, a ten-minute state/nonce request and Google S256 PKCE. The
requesting app or browser retains a separate random verifier for result delivery.
Callbacks return a confirmation page; they never carry an app session in a URL.
Verified JWT signatures, issuer, audience, authorized party, age and nonce precede
identity use. Google requests only openid, with no mail, Drive or profile scopes.
Apple uses its Services ID with code/query and no requested name/email scopes.
Only a digest of the provider's stable subject is retained as the identity link.
Apple refresh credentials needed for revocation are encrypted in the host's
authentication vault. These are separate from off-host firm record recovery keys.

Linking rechecks an existing MFA-verified session and its original account.
Provider login produces the existing mandatory-MFA challenge, never an immediate
privileged session. Disconnection checks that same authority, revokes Apple's
retained authorization before removing its link, and invalidates outstanding
provider flows and pending MFA requests. Existing password/key recovery remains
available. Full customer deletion and backup retention still need qualification.

The key-holding independent portal runs no provider SDK. It clears its opened
view before a separate provider popup, retains the result verifier in memory,
and accepts only the fixed provider origins, paths, pinned API callback and
identity-only query parameters. Android uses the same protocol through an
external browser and rejects broader scopes or changed callback addresses. It
waits until foregrounded before receiving a fresh authenticator challenge. Its
app-return URI contains no token, code or record information. iOS integration
and physical device acceptance remain pending.

Google project and OAuth web client are registered; credentials are held outside
Git and staged in the provider environment. Google consent publication and Apple
Services ID/key configuration are being completed. Do not claim live social
sign-in until the actual provider, account link and subsequent MFA session have
been observed. Keep customer onboarding and public discovery disconnected until
hosted encrypted mobile-to-browser sync and recovery are qualified.

Focused validation at this checkpoint: 85 API/auth/encrypted-vault tests passed
with one existing skip, 41 browser checks passed with one existing skip, and
TypeScript passed. Runtime dependency audit reports zero known vulnerabilities.
These are local checks, not an independent audit or a production readiness claim.
