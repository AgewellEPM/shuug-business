# Gig Tax Pros cloud candidate — November 16, 2026

This candidate uses the committed protected-office backend from 74c8373 in an
isolated branch. It does not replace an existing local installation or import
client data. This is qualification infrastructure, not a public connected launch.

The production Docker build passed Next compilation, TypeScript and static page
generation after installing the secure client package's crypto dependencies.
Next was patched to16.4.6, MCP to1.32.2 and affected compatible transitives were
updated. Both full and runtime-only dependency audits returned zero known
vulnerabilities at verification time. Focused authorization, client, driver,
crypto and backup checks passed156 tests with one existing skip.

Dockerfile.gigtax-cloud installs the crypto package and OpenSSL, supports the
provider's persistent-volume ownership, then drops privileges before application
initialization. start-gig-tax-cloud.ts requires authentication, no demo seeding,
a dedicated empty directory, a verified hosted origin and a private first-boot
owner password hash. It never imports user data, resets an existing owner or
provides a public setup endpoint. Incomplete setup fails for review.

The separate provider service has independently verified limits of0.5vCPU and
1,000,000,000 memory bytes, one replica and persistent storage mounted at/data.
Application data is/data/workspace. The provider created its standard50,000MB
volume capacity; only7.8MB was used when checked. A1GB hard volume capacity was
not installed through the exposed API. Verify usage/quota controls before any
real-data promotion; volume billing is based on actual use.

The original deployments did not start. Fresh deployments subsequently reached
SUCCESS; the current instance serves HTTPS health200. Owner password verification
survived a new image deployment against the persistent volume. The temporary
first-boot password hash was removed from provider configuration after that proof.
MFA remains mandatory. The owner has not yet completed authenticator enrollment;
do not claim a completed owner session or hosted client enrollment.

The independent static browser client is deployed at https://portal.gigtax.pro
on a separate Vercel project, with its public trust configuration pinned at build
time. All470 initial artifact files matched their live HTTPS hashes. CSP limits
network connections to the ciphertext API; responses use no-store/no-referrer,
frame protection and no worker or external script authority. The API permits the
exact portal origin, returns401 anonymously, and rejects an unrelated origin403.
The public marketing site's workspaceUrl remains null.

Signing and firm recovery keys were generated off the API host. Only their
public pins are present in deployment configuration. The encrypted custody
bundle has a byte-verified external-disk copy and passed an unlock check against
its independently stored pins. The owner still needs an independent backup of
the unlock passphrase. No real customer has been invited or migrated.

An authentication form referrer bug was fixed and deployed. A subsequent owner
report describes a reset/login loop. Opening a second login tab was found to
replace the CSRF cookie of the first; the new candidate reuses a valid browser
nonce and gives explicit restart links for expired verification. A focused test
completes synthetic password/MFA setup through the actual route handler and
confirms that its resulting session passes the actual page proxy. Human Safari
completion remains the live acceptance boundary.

The new candidate also provides a separate origin-free, cookie-free native
private-account session endpoint. It accepts opaque account codes, mandatory
MFA and bearer sign-out; browser sign-in retains exact-origin enforcement.
The browser dashboard projects authenticated native journal records, counts
identical copies once and excludes differing copies from totals for review.
These records remain distinct from deposits, invoices, trip fares and payouts.

The stronger client/off-host firm recovery boundary remains in force. The local
workspace, secrets, private worker and client records were not uploaded. Real
protected key setup, migration and full app/web parity remain incomplete. The
private worker is not configured in this cloud candidate.

Next: deploy and verify the login-loop candidate, finish owner MFA in Safari,
then qualify synthetic hosted private enrollment and Android-to-browser sync,
isolation, deletion and backup/restore. The Android implementation is on its
existing release branch; iOS parity and new store builds remain pending. Keep
discovery disconnected and real records local until those paths are qualified.
