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

The first build failed because the inherited Dockerfile omitted nested crypto
dependencies; that boundary was fixed. The corrected image built successfully
but its container stayed INITIALIZING with no application logs and public
health404. A bounded retry pinned the service to the existing volume's region
and reused the same built image. The superseded stuck deployment was cancelled
and verified REMOVED. The new deployment is still DEPLOYING/INITIALIZING. No
startup, owner authentication, persistent restart or hosted recovery pass is
claimed. Do not promote the discovery configuration based on a successful build.

The stronger client/off-host firm recovery boundary remains in force. The local
workspace, secrets, private worker and client records were not uploaded. Real
protected key setup, migration and full app/web parity remain incomplete. The
private worker is not configured in this cloud candidate.

Next: establish actual container startup and HTTPS health, then run synthetic
owner/client/isolation/restart/backup checks. Remove the temporary first-boot
hash only after persisted owner configuration is verified. Keep discovery
disconnected and real records local until the protected migration is qualified.
