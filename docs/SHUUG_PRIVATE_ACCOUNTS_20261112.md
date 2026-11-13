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

Lost-password recovery, loss of both client key and backup, owner-reviewed
replacement of customer keys, and authenticator replacement without remaining
recovery codes are unfinished. The system does not invent an email-reset path or
silently replace the enrolled key. If the activation response is lost after
commit, the saved invitation still contains the account code: try signing in
with the selected password and original key before requesting a new invitation.

## Legacy boundary

The old `/enroll` endpoint rejects first enrollment when known plaintext client
data exists, including names, emails and service profiles. Existing historical
enrollments remain usable and can renew their signed manifest under the prior
epoch/key rules; their status still reports migration requirements. Existing
names/email, provider secrets, files, logs, database history and backups have not
been removed. Synthetic historical tests seed prior enrollment internally and
separately verify that public first enrollment is blocked.

## Evidence

`docs/verification/private-accounts-20261112.json` records compiled HTTP,
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
