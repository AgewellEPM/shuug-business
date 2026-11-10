# Encrypted staff access contract v1

The original v2 client envelope is unchanged. A separately trusted firm device
authenticates its existing recovery slot, checks content integrity, and delegates
only that object's data key to an individually authorized staff device. Private
client, recovery and signing keys never enter the ciphertext API or staff UI.
Staff access granted by this contract is read-only. Future object revisions require fresh
capsules; absent sharing must be shown as pending, not silently treated as empty.

## Signed grant

Strict JSON fields:

```js
{
  version: 1, type: 'shuug-secure-tax-staff-grant',
  grantId, workspaceId, accountId, clientId, staffAccountId,
  epoch, status: 'active' | 'revoked',
  staff: { keyId, publicKey },
  domains: ['tax-document', /* allowed existing outer domains */],
  rights: 'read', issuedAt, expiresAt,
  signature: { algorithm: 'ES256-P1363', signerKeyId, value }
}
```

The device identity is `staff.keyId`, the SHA256 fingerprint of its uncompressed
P256 public key. There is no independent device ID to lose or substitute during
backup import. A new replacement key is a new device and needs a new signed grant.
The public device request is
`{version:1, workspaceId, staffAccountId, staff:{keyId,publicKey}}`.
The offhost signer independently chooses the client/account scope and verifies
the staff identity/key fingerprint before signing.

`domains` is a nonempty duplicate-free subset in this exact order:
tax-document, tax-identity, driver-record, driver-receipt, driver-state,
driver-route, provider-record. Identifiers use the existing secure ID grammar.
Times are UTC ISO timestamps; epochs are positive integers bounded to 1e9.
Unknown fields, invalid public keys and invalid signatures fail closed. Active
grants and capsules must be current. An expired signed revocation may be retained
solely as a denial checkpoint; it cannot authorize access.

The UTF8 canonical grant string is JSON.stringify of:

```js
[1, 'shuug/secure-tax-staff-grant', grantId, workspaceId, accountId,
 clientId, staffAccountId, epoch, status, staff.keyId, staff.publicKey,
 domains, 'read', issuedAt, expiresAt]
```

`grantDigest` is unpadded base64url SHA256 of that string. It excludes signature
bytes so another valid ES256 signature on identical semantics does not change
the binding. Revocation uses the same grant ID and scope/key with a higher epoch.
Server and trusted clients retain monotonic epochs; a changed same-epoch body is
not a retry. Every server read rechecks active staff identity, the current owner's
explicit encrypted read approval, current enrollment and active signed grant.
Owner publication of a valid signed grant supplies that normal encrypted read
assignment; it does not require creating a forbidden legacy book for an enrolled
client. An owner withdrawal cannot be undone by replaying the same signed epoch.

## Signed object capsule

```js
{
 version:1, type:'shuug-secure-tax-staff-capsule', capsuleId,
 grantId, grantEpoch, grantDigest, manifestId, manifestEpoch,
 context:{workspaceId,accountId,objectId,revision,domain},
 envelopeDigest, staffKeyId,
 wrap:{suite:'HPKE-P256-SHA256-A256GCM',mode:'auth',encapsulatedKey,wrappedKey},
 issuedAt, expiresAt,
 signature:{algorithm:'ES256-P1363',signerKeyId,value}
}
```

The key-binding canonical string is JSON.stringify of:

```js
[1,'shuug/secure-tax-staff-key',capsuleId,grantId,grantEpoch,grantDigest,
 manifestId,manifestEpoch,context.workspaceId,context.accountId,context.objectId,
 context.revision,context.domain,envelopeDigest,staffKeyId,issuedAt,expiresAt]
```

HPKE Auth uses a fresh sender context for each 32-byte data-key wrap, the staff
public key as recipient, and the firm recovery key as authenticated sender.
Its info is UTF8 `shuug/secure-tax-staff-key/v1`; its AAD is the key-binding string.
`encapsulatedKey` is canonical base64url of 65 bytes and `wrappedKey` of 48 bytes.
The capsule signature covers JSON.stringify of:

```js
[1,'shuug/secure-tax-staff-capsule', canonicalStaffCapsuleKey(capsule),
 wrap.suite,wrap.mode,wrap.encapsulatedKey,wrap.wrappedKey]
```

The full original envelope digest uses JSON.stringify of:

```js
[2,'shuug/secure-tax-envelope-digest',envelope.suite,envelope.contentAlgorithm,
 envelope.hpkeMode,envelope.author.role,envelope.author.keyId,
 context.workspaceId,context.accountId,context.objectId,context.revision,
 context.domain,envelope.nonce,envelope.ciphertext,
 envelope.recipients.map(r=>[r.role,r.keyId,r.publicKey,r.encapsulatedKey,r.wrappedKey])]
```

All original v2 framing and exact ordered recipients are validated first. The
capsule binds its exact grant epoch/digest, signed enrollment manifest ID/epoch,
source envelope/context/revision and staff key. Its expiry cannot exceed the
grant or manifest expiry. A server/client must reject stale revisions, wrong
accounts/clients/devices, unlisted domains and revoked grants. Capsule issuance
validates the original HPKE-authenticated content before sharing its key. Staff
verify the pinned ES256 signature before using a delegated key; this binds the
exact original authenticated object rather than relying on recipient-forgeable
HPKE Auth alone.

## Shared exports and client APIs

`staff-contract.mjs` is pure shared framing:
`assertStaffGrantShape`, `assertStaffCapsuleShape`, `canonicalStaffGrant`,
`canonicalStaffCapsule`, `canonicalStaffCapsuleKey`, `canonicalEnvelope`,
`STAFF_DOMAINS`. It has no filesystem, network or crypto dependency. Shape
assertions are strict. Canonical functions permit an empty signature value only
for local signing; verification must call the full shape assertion first.

`staff-grants.mjs` exports:

```js
await verifyStaffGrant(grant, expected, pins, now=Date.now())
await openStaffCapsule(capsule,envelope,manifest,grant,expected,pins,
                      staffPrivateKey,now=Date.now()) // Uint8Array plaintext
```

Expected binding is `{staffAccountId,staffKeyId,accountId,clientId,
minimumGrantEpoch?,minimumManifestEpoch?,objectId?,revision?,domain?}`.
Grant verification returns at least `{grantId,epoch,status,grantDigest}`.
The independent pins remain `{workspaceId,signerPublicKey,firmRecoveryPublicKey}`.
The browser uses local nonextractable key custody and encrypted backup in a
separate staff database. Lock clears plaintext and unlocked-key references while
the authenticated session remains in memory. Sign-out, expiry and authentication
denial clear the session token. Tokens and plaintext are never persisted.

`firm-staff.mjs` provides offhost signing, per-object sharing and replacement-key
recovery. CLI operations require the existing explicit offhost acknowledgment,
bounded selected files, passphrase FD, independent pins, exclusive private
outputs and no network. Reissuing a capsule to a new staff key leaves the original
client v2 envelope untouched. No ordinary staff key can sign grants or recover
another recipient's data.

The exact high-level offhost exports are:

```js
await signStaffGrant(request,unlocked,{epoch,grantId?,status?,domains?,validDays?,now?})
await createStaffCapsule(envelope,manifest,grant,unlocked,expected,{now?,validDays?})
await revokeStaffGrant(grant,unlocked,{epoch,now?,archiveValidAt?})
```

Grant issuance request adds independently selected `accountId` and `clientId` to
the public device request. `staff-offline-cli.mjs` accepts common
`--confirm-off-host --passphrase-fd N --bundle PATH --public-pins PATH` options.
`grant` takes `--request PATH --epoch N --out PATH` and optional `--grant-id ID`
and `--domains CSV`. `share` takes `--grant PATH --manifest PATH --envelope PATH
--expected PATH --out PATH`. `revoke` takes `--grant PATH --epoch N --out PATH`.
`recover-device` takes `--prior-grant PATH --request PATH --epoch N --manifest PATH
--envelope PATH --expected PATH --grant-out PATH --capsule-out PATH --revoke-out PATH`.
It verifies the prior scope, requires a different new staff key, preserves domain
restrictions, and exclusively writes the new grant/capsule plus a higher-epoch
revocation of the old grant. The owner must publish those public files to apply
server access changes. New grants, capsules and the selected enrollment manifest
must be current. If the prior grant expired, revoke/recover-device additionally
require `--prior-valid-at UTC`, an independently reviewed past time inside that
grant's signed validity interval (library option `archiveValidAt`). Historical
signature validation only authorizes issuing a new current revocation; it never
permits stale API access or capsule opening. The existing archive recovery
command remains the path for expired enrollment manifests/backups.

The HPKE Auth recipient-compromise limitation is described in
[RFC 9180 section 9.1.1](https://www.rfc-editor.org/rfc/rfc9180.html#section-9.1.1).
The independent ES256 signature binds the encapsulated key and wrapped key, along
with their full grant/object context. This application protocol still needs an
independent security review; this implementation and its tests do not supply one.

## Separately approved return corrections

The versioned return-correction extension does not add write rights to these
grants or change native v2 framing. A preparer proposes a correction encrypted
to the firm; the firm separately reviews, encrypts and signs one exact new
revision and its fresh read capsule. Owner MFA publishes both atomically under
current assignment/enrollment and source compare-and-swap checks. Private
before/after review files stay off the app/data host. See the
[return-correction workflow](SHUUG_RETURN_CORRECTIONS_20261109.md) for both
custody paths, strict packet contracts and verification limits.

## Separately approved encrypted cases

The case extension keeps the existing v1 read grant/capsule and native v2 wires.
Its four private actions create a case, add a request, review an exact uploaded
file (including replacement requests), or link a matching draft. Actions, notes,
history and dependency references stay encrypted. A dedicated private ES256
certificate binds the entire case body and full object/client/version context;
neither a firm HPKE author field nor a read capsule establishes case review.
Certificates remain historical; current read authorization retains its expiry.

`POST /secure/staff/cases` requires owner MFA before reading the selected public
`{approval,envelope,capsule}` packet, validates the current assignment/enrollment/
grant and firm approval, and commits case ciphertext plus capsule atomically.
Updates require exact source version/digest and case registry ownership. Reserved
`shuug-case:` IDs are unavailable to generic writes/retries/deletes, including
before first publication. Readers also reject ordinary payload substitution there.
Exact retries cannot replace later history. No action/evidence relationship is
added to server metadata. Case archival requires a future explicit workflow.

Both readers derive review/draft freshness from exact currently opened envelope
references. Changed, deleted or unshared sources cannot establish completion.
All notes/history are client-visible within encryption; staff target dates are
not statutory deadlines. This supplies no client filing authorization. See
[the full case protocol and operator workflow](SHUUG_ENCRYPTED_CASES_20261110.md).

## Limits

Revocation denies honest API access and stops new capsule publication. It cannot
erase already viewed plaintext or a downloaded old data key/ciphertext. Fresh
revisions use fresh data keys and must never be shared to a revoked device.
Monotonic local history detects known rollback; a first-use device cannot prove
fresh revocation state against a compromised host without an independent current
authority checkpoint. Do not claim that stronger guarantee. Existing legacy
copies and compromised recipient endpoints remain separate migration/risk gates.
