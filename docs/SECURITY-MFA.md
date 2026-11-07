# Authenticator verification

Set `SHUUG_REQUIRE_MFA=true` in the workspace process environment before an
office pilot. This enforces MFA for owner, employee and invited-client sessions.
`WORKSPACE_REQUIRE_MFA=true` in the existing server vault is the equivalent
operator setting. Generic deployments keep their existing sign-in behavior
until enforcement is enabled; an enrolled account always requires its factor.
Enabling enforcement immediately invalidates old password-only sessions.

After the password is verified, an unenrolled user receives a five-minute setup
challenge. Add the displayed setup key to an authenticator as a time-based
account, then enter its six-digit code. Enrollment returns ten recovery codes
once. Save them privately, away from the phone/authenticator. Each recovery
code works once with the password and revokes other MFA session grants.
Password-reset invitations do not erase an account's MFA factor.

The setup challenge is not an owner, employee or customer session. Verification
rechecks account status, password binding, factor revision and the intended
staff/client audience. Successful factor verification and session creation
commit together. Codes use the RFC 6238 SHA-1/30-second profile, a bounded
one-step clock window and persisted replay counters. Failures are throttled
across challenges. Recovery codes are stored as hashes; TOTP secrets are sealed
using the workspace's existing server vault. Authenticator verification is
separate from offhost tax-data encryption and key recovery. Existing machine
credentials and standalone share links require their own scoped authorization
review; this milestone does not claim that every legacy access path is gated.

Supported source interfaces:

- Staff `/api/auth/login` and invited-client portal forms handle enrollment,
  verification, retries and recovery-code display.
- Driver `/api/website/customer/driver/session` and independent-browser
  `/api/website/customer/secure/session` accept normal credentials first. A 428
  response includes `mfaRequired`, a bounded `challengeToken`, expiry and setup
  details when needed. Submit `{challengeToken, code}` to the same endpoint to
  finish. Only that successful response contains an account session token.
- The independent encrypted browser client keeps pending setup only in memory;
  Lock clears it. It does not persist passwords, OTPs or recovery codes.
- iPhone Account supports the same two steps. Recovery codes stay in view state;
  they are excluded from the saved `ConnectionProfile` and Keychain session.
- WordPress relays MFA through its authenticated, nonce-protected command path.
  Full backend session tokens remain on the PHP server. Owner authority is
  checked again after factor verification before the connection is stored.

`node --import tsx scripts/mfa-http-check.ts` exercises a compiled production
server with temporary synthetic identities, a localhost listener and guaranteed
server cleanup. Unit checks include RFC vectors, one-time/recovery behavior,
revocation, expiry, rate limits and audience isolation. Browser/WordPress DOM
checks verify the interactive state changes without a browser runtime.

This milestone does not establish a security certification, complete encrypted
staff bookkeeping, deployment of the new phone build, or visual acceptance.
Do not enable enforcement on the existing driver service until its intended
client builds and operator recovery procedures are reviewed and installed.
