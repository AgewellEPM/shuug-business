# Client-owned private records

Gig Tax Pros requires a client-only profile. Platform administrators must not
receive a decryption recipient, a recovery recipient, a delegated content key,
or a workflow that replaces a client's encryption key. This requirement
supersedes the earlier default firm-recovery recipient for this product.

The existing generic firm workflow remains a separate legacy format. Its
envelope v2 and manifest v1 must never be interpreted as client-only records.
Existing copies of legacy records remain decryptable by their original
recipients. This change cannot revoke historical possession of those keys.

## Protocol contract

The literal profile identifier is `client-only-v1`.

Browser public config has exactly:
`version:2, profile, uiOrigin, apiOrigin, workspaceId, signerPublicKey`.
Native public pins have exactly:
`version:2, profile, workspaceOrigin, workspaceId, signerPublicKey`.
Public config never includes a firm recovery key. The signing key approves
public account bindings only; it grants no decryption authority.

Manifest v2 has exactly:
`version, profile, manifestId, workspaceId, accountId, clientId, epoch, client,
issuedAt, expiresAt, signature`.
`client` is `{keyId,publicKey}`; signature is
`{algorithm:'ES256-P1363',signerKeyId,value}`. Public keys are P-256 uncompressed
65-byte points; IDs are SHA-256 of those bytes, encoded as unpadded base64url.
The manifest signing bytes are UTF-8 JSON of this exact array:

```text
[2,"gigtax/client-only-manifest","client-only-v1",manifestId,workspaceId,
 accountId,clientId,epoch,client.keyId,client.publicKey,issuedAt,expiresAt]
```

Client implementations must compare the manifest's client public key with their
locally held or locally recovered private key. A valid owner signature alone
must never replace that key. A client's encryption key must differ from the
public signing key. Canonical IDs, points, timestamps, signatures and epochs
retain the existing strict validation rules.

Envelope v3 has exactly:
`version,profile,suite,contentAlgorithm,hpkeMode,author,context,nonce,ciphertext,
recipients`.
The suite remains `HPKE-P256-SHA256-A256GCM`, content algorithm `AES-256-GCM`,
and HPKE mode `auth`. Author is exactly `{role:'client',keyId}`. There is exactly
one recipient, with the existing slot fields
`role,keyId,publicKey,encapsulatedKey,wrappedKey`, and role `client`.
The context keeps the existing workspace/account/object/revision/domain fields.
The seven existing content domains and size bounds remain unchanged.

Use the existing HPKE implementation and one fresh random 32-byte content key
per envelope. HPKE Auth sender and sole recipient are the client's key pair.
HPKE info is UTF-8 `gigtax/client-only-envelope/v3`. The base authenticated bytes
are UTF-8 JSON of:

```text
[3,"gigtax/client-only-envelope","client-only-v1",context.domain,
 context.workspaceId,context.accountId,context.objectId,context.revision,
 "AES-256-GCM","HPKE-P256-SHA256-A256GCM","auth",
 ["client",clientKeyId],["client",clientKeyId]]
```

Wrap the content key with HPKE Auth and those base bytes as AAD. Content AES-GCM
AAD is UTF-8 JSON of `[baseBytesDecodedAsUTF8String,
[slot.role,slot.keyId,slot.publicKey,slot.encapsulatedKey,slot.wrappedKey]]`.
Use a fresh 12-byte content nonce. Retain local private/public pair proof,
strict decoding and wiping of transient content-key/plaintext buffers.
Reject extra recipients, recovery fields, firm authors, old versions, changed
contexts, wrong keys and unknown profiles.

## API and persistent authority

The new namespace is `/api/website/customer/client-only`. It provides status,
objects/change feed, object CAS PUT/DELETE, same-key enroll/renewal, private
activation challenge/activation, private session/native-session/account and
social aliases. Provider callback URLs remain unchanged. Authentication/MFA
remain separate from encryption-key possession.

Use separate client-only policy/enrollment/object/clock/mutation tables. Persist
an immutable account/client/workspace/profile/client-public-key anchor before
the first encrypted record. Never remove that anchor through record deletion,
expiry, suspension, tombstones or credential resets. Initial support forbids
changing that key. Renewals advance the signed epoch with the same key/profile.
Retain existing CAS, idempotency, bounded feed, capacity and tombstone behavior.

Invitations have exactly the existing invitation fields plus `profile`, with
`version:2,type:'gigtax-client-only-invitation'`. Store invitation profile
explicitly, and consume it only for matching new-profile activation. Private
account authentication can reuse the existing opaque account table, password
hashing and mandatory MFA. Do not create a plaintext customer/contact record.

Activation uses a separate HPKE Base possession challenge. Its fields match the
existing activation-proof fields plus `profile`, with version 2 and type
`gigtax-client-only-activation-proof`. HPKE info is
`gigtax/client-only-activation-proof/v2`. Proof AAD is UTF-8 JSON of:

```text
[2,"gigtax/client-only-activation-proof","client-only-v1",challengeId,
 workspaceId,accountId,clientId,manifestId,manifestEpoch,keyId,expiresAt]
```

Answer bytes are a fresh random 32 bytes; store only their SHA-256 digest and
consume every attempted proof. Bind proof rows to the exact canonical manifest
digest and current profile invitation. New account activation stores the first
v3 encrypted tax-identity envelope atomically with policy/account creation.

`GIGTAX_REQUIRE_CLIENT_ONLY=true` refuses legacy private-data and activation
routes. Independently of that setting, an anchored client-only account must
always fail legacy enrollment, staff sharing, firm recovery and plaintext
writes. Keep legacy tests and other explicitly legacy workspaces functioning.
Owner authentication and provider management remain available.

## Client custody and dispatch

Use the client's existing passphrase-encrypted key backup and nonextractable
local key custody. The encrypted key backup is key material, not authority to
select a profile or account: imported keys must match the independently pinned
new profile, the exact signed manifest, and local immutable account binding.
Neither the backup nor its passphrase is sent to the data host. A backup from an
older setup must never implicitly import its legacy manifest or retry queue.

Bind the profile into local account/checkpoint namespaces. Reject or quarantine
old pending envelopes before any network dispatch; preserve original files.
Legacy acknowledgments/fingerprints cannot suppress new-profile uploads. No
firm key rotation, firm recovery, staff capsules or automatic legacy migration
is available for this profile. Recover the identical key from a client-held
encrypted backup. Loss of every usable key/backup means unrecoverable contents.

## Verification and limits

Verify actual JS/Kotlin/Swift ciphertext compatibility, wrong-owner/signer-key
failure, extra-wrap rejection, persistent same-key policy with empty accounts,
tombstones and restored storage, and denial of every legacy admin recovery path.
Verify actual packaged pins and dispatch paths, then the deployed browser/API
and signed mobile build. Source tests alone do not establish device/live sync.

This removes the ordinary administrator/backup decryption capability. An
operator-controlled malicious client update can still capture data when a user
opens it; operator-controlled web delivery is part of that trust boundary.
Do not claim protection from malicious delivered code, absolute zero access,
independent security review, or completed migration of historical copies.
