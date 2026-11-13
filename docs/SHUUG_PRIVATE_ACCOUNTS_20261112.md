# Private client accounts — implementation and limits

New clients sign in with a random private account code, password and authenticator.
The independent browser encrypts their legal name, optional contact email, phone
and mailing address before sending the profile to the app host. Contact details
are editable as an encrypted `tax-identity` item; email is not a login identifier.

This is a prototype feature. It does not finish the tax product or enable real
filing, verified legacy migration, or deployment without the separate key setup.

## Ordinary setup

1. The owner signs in to the independent staff client with MFA, creates an
   invitation, and gives its downloaded file to the verified client through the
   firm's private process. The invitation expires after 48 hours. Names and email
   cannot be added to its API request. The host retains only a token hash.
2. The client creates a local key and saves its encrypted backup, or imports an
   existing backup. The client loads the invitation and downloads a public
   enrollment request. The private key never enters that request.
3. The separate firm signing environment reviews and signs the request with the
   existing enrollment CLI/service. The client selects that signed manifest and
   enters their private profile and a separate account password.
4. Activation verifies the firm signature and exact invitation scope, then
   requires a five-minute, one-use HPKE challenge proving possession of the
   manifest's client key. A distinct protocol domain separates this challenge
   from tax envelopes. Incorrect answers consume their challenge.
5. One database transaction creates the opaque account, signed enrollment and
   first encrypted profile and consumes the invitation. It rejects collisions
   with legacy account/client rows and known plaintext data. No legacy customer
   or service-client profile is created.
6. The client signs in with the displayed account code and password, enrolls an
   authenticator and saves its one-use recovery codes. MFA is mandatory even when
   the workspace's optional MFA setting is off. New private accounts use a
   distinct MFA audience and session table.

The independent client artifact remains disabled until real public trust pins
and distinct HTTPS client/API origins are installed. Its packaging metadata
separates support for new private accounts from unavailable legacy activation.

## Access and recovery

The owner can revoke pending invitations or suspend/restore a private account
by its opaque account code. Suspension revokes sessions and pending logins and
blocks new staff reads of that client's encrypted records. Restoration requires
a fresh client sign-in. It does not erase previously downloaded copies.

Authenticated clients can change their password using their current password,
or revoke every account session. Both actions invalidate sessions and pending
login challenges. Password changes preserve the enrolled authenticator, recovery
codes and encryption keys. Failed password changes are rate limited.

An encrypted client-key backup plus its separate passphrase recovers the same
key on another browser. An unused MFA recovery code works once with the account
password and invalidates earlier MFA session grants. These are distinct backups:
an authenticator recovery code cannot decrypt tax data.

Forgotten-password recovery is implemented with separate firm approval and the
existing client key; see the workflow below. Authenticator replacement without
remaining MFA recovery codes is also implemented with separate firm approval.
Loss of both client key and backup and reviewed replacement of customer encryption
keys are unfinished. The system does not invent an email-reset path or
silently replace the enrolled key. If the activation response is lost after
commit, the saved invitation still contains the account code: try signing in
with the selected password and original key before requesting a new invitation.

## Forgotten-password workflow

The owner enters the private account code and downloads a private recovery
invitation. It expires within 24 hours, is bound to the current password and
signed key enrollment, and supersedes earlier pending requests for that account.
The owner can revoke it. Suspending or restoring account access also revokes any
pending recovery. No email address is requested or stored.

The separate firm operator reviews the client identity and existing key
fingerprint through the firm's agreed process. On the key computer, run
`offline-cli.mjs approve-password-recovery` with the selected private invitation
as `--request`, existing encrypted bundle/public pins, passphrase descriptor,
exclusive output, `--confirm-off-host` and
`--confirm-identity-and-fingerprint`. This produces an exact signed approval
valid for at most four hours. The flags are operator attestations; they do not
perform identity proofing or establish physical separation.

The cloud alternative is `prepare-password-recovery-job.mjs`. It takes the
invitation, public pins, a review reference and explicit identity/fingerprint
confirmation, then saves a job containing only the public request and manifest.
The private invitation token is excluded. The existing immutable-version/hash
review and separately controlled IAM/MFA worker execute
`approve-password-recovery`. Neither preparation nor these tests provisions AWS.

The independent client loads its invitation and the signed approval, selects or
recovers the original client key, and chooses a new password. A distinct
password-recovery HPKE protocol proves possession of that key. The server checks
the still-current request, password binding, account status, manifest and signed
approval, consumes the one-use proof, changes the password and revokes sessions
and pending logins in one transaction. It preserves the authenticator, one-use
MFA recovery codes, encryption keys and encrypted records. Incorrect proof
answers are consumed; changed credentials, revocation, suspension, expiration
and replay fail closed.

This workflow requires a valid enrolled manifest and the original client key or
its encrypted backup. The owner can renew an expired manifest first, as described
below. Complete client-key loss remains unfinished.
If the response is lost after completion, try the chosen new password with the
existing authenticator before asking the firm for another recovery.

## Expired enrollment renewal

An expired manifest still permits account-code/password/MFA sign-in and public
renewal metadata. It does not permit encrypted reads or writes. The client selects
the existing key and downloads a renewal request from **Renew encrypted access**.
The verified owner can also download it by private account code, including when
the client has forgotten their password.

The separate firm operator reviews the account and key fingerprint, then invokes
`offline-cli.mjs renew --request PUBLIC-REQUEST --out NEW-RENEWAL` with the existing
bundle, public pins, passphrase descriptor, `--confirm-off-host` and
`--confirm-identity-and-fingerprint`. The cloud alternative is
`prepare-enrollment-renewal-job.mjs`, followed by the existing immutable-version,
hash-reviewed IAM/MFA worker operation `renew-enrollment`. No key initialization
or cloud provisioning occurs during preparation.

The signed packet retains both encryption keys and advances the epoch. Either
the client or owner publishes it against the exact prior signed manifest. Stale
packets, changed keys, forged signatures and decreasing epochs are rejected;
exact repeats are idempotent. Existing ciphertext and revisions are preserved.
Pending password-recovery invitations are revoked when enrollment changes;
request a fresh one after renewal. Staff read capsules and outstanding mutation
approvals must be refreshed for the new manifest. Renewal is not key rotation.

## Lost authenticator

The owner saves an authenticator-recovery invitation using the private account
code. It binds the current password, MFA factor revision and signed encryption
enrollment, expires within 24 hours and supersedes earlier pending invitations.
The owner can revoke it. Suspension/restoration, enrollment renewal, password
change or another completed factor replacement invalidates the pending recovery.

The separate firm operator must explicitly review replacement of the factor,
the client identity and the original encryption-key fingerprint. Use
`offline-cli.mjs approve-authenticator-recovery` with `--request PRIVATE-INVITATION`,
`--out NEW-APPROVAL`, the existing bundle/public pins/passphrase descriptor and
both confirmation flags. The public-only cloud alternative is
`prepare-authenticator-recovery-job.mjs`; its token-free job uses the existing
immutable-version/hash approval and `approve-authenticator-recovery` worker.
The approval is valid for at most four hours and cannot authorize password reset.

In **Replace a lost authenticator**, the client loads both files, selects the
original encryption key and enters the current password. If the password is also
lost, complete password recovery first, then obtain a fresh authenticator request.
The client proves the original key through a separate HPKE challenge and receives
a replacement setup key. The old authenticator remains enrolled during setup.

Only a valid code from the new authenticator commits replacement. That transaction
advances the factor revision, revokes all old sessions, login challenges and
recovery codes, creates ten new one-use recovery codes and consumes the request.
The password, encrypted documents, encryption keys and staff sharing remain
unchanged. Wrong key answers consume their challenge; five wrong new codes require
a fresh setup. Password attempts are rate limited. Setup expires after five
minutes and is cleared by locking or leaving the tab.

Save the new recovery codes. Sign in once the replacement authenticator displays
a fresh code, or use one new recovery code; the code that completed setup cannot
be reused. If the completion response is lost, retain the replacement authenticator
and try its next code before requesting another recovery. Neither the host nor
the client silently removes MFA or falls back to email.

## Legacy boundary

The old `/enroll` endpoint rejects first enrollment when known plaintext client
data exists, including names, emails and service profiles. Existing historical
enrollments remain usable and can renew their signed manifest under the prior
epoch/key rules; their status still reports migration requirements. Existing
names/email, provider secrets, files, logs, database history and backups have not
been removed. Synthetic historical tests seed prior enrollment internally and
separately verify that public first enrollment is blocked.

## Evidence

`docs/verification/private-accounts-20261112.json` and
`docs/verification/password-recovery-20261112.json` record compiled HTTP,
route-level, cryptographic and packaged-client checks. The HTTP fixture uses
disposable synthetic records and the actual compiled Next server. It proves
activation, compulsory MFA, ciphertext profile review, owner suspension,
password/session controls, one-use recovery, encrypted key-backup recovery and
stopped-server database backup/restore. Synthetic profile strings are absent
from captured API bodies and host database files.

The packaged ESM graph executes in a Node V8/DOM model, including mounted disabled
setup/access controls and twelve annual draft PDF exports. This is not Safari or
visual acceptance. The installed service, real taxpayer records, public TLS,
physical separate-key custody and live filing were not changed or verified.
All-state/full federal coverage, 2026 calculations, live filing/acknowledgments,
signature execution, complete migration and installed rollout remain unfinished.

`docs/verification/enrollment-renewal-20261113.json` adds actual compiled HTTP and
offline CLI renewal, preserved ciphertext and refreshed staff sharing. Production
builds on constrained storage can use `SHUUG_BUILD_NO_CACHE=true npm run build` to
disable webpack's persistent build cache while retaining the compiled output.

`docs/verification/authenticator-recovery-20261113.json` records the new-factor
proof, cross-purpose rejection, old-code/session revocation, unchanged ciphertext,
actual offline approval CLI and a second stopped-server backup/restore. Physical
key custody, real customer migration and installed service acceptance remain open.
