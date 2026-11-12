# TateWay's dedicated Shuug host

This package prepares `https://portal.tatewayauto.com` on one persistent Linux
host. It does **not** provision a host, change DNS, start Docker, buy a service,
publish a certificate, or activate providers. The existing Vercel website at
`tatewayauto.com` / `www.tatewayauto.com` stays unchanged until HTTPS is verified.

Use a dedicated TateWay volume and credentials. Never copy the Mac's demo data,
demo owner gateway, another firm's vault, or an existing shared database. This
is one business per deployment, not shared multi-tenant hosting.

## Host and DNS prerequisites

An approved host/account must provide persistent local storage, Docker with
Compose, and inbound TCP 80/443. Restrict SSH administration to the operator's
address. Only Caddy publishes application ports; Node 3000 stays inside Docker.
Allow outbound HTTPS for certificate issuance and separately authorized providers.
Point only the `portal.tatewayauto.com` DNS record at this host; check any AAAA
record too. Preserve the apex and `www` Vercel records. Confirm hosting terms and
cost before provisioning; no provider or free-tier entitlement is assumed here.

From a reviewed, backed-up source commit on that host:

```sh
cd deployments/tateway-auto
cp host.env.example host.env
chmod 600 host.env
node validate.mjs host.env
```

`host.env` contains only public origin, image and volume settings. Pin
`SHUUG_IMAGE` to a unique reviewed release tag before a real rollout, and record
the resulting image ID and Caddy image digest. Keep provider keys in Shuug's
encrypted Connections vault, never in Git, a website bundle, this file, URLs,
command arguments, chat, build arguments or container logs.

## Initialize privately, then configure through the real MCP

Run these commands from this directory. The setup container has no network;
the owner's password is entered through the native hidden-input CLI.

```sh
docker compose --env-file host.env build web
docker compose --env-file host.env --profile setup run --rm --no-deps initialize
docker compose --env-file host.env --profile setup run --rm --no-deps initialize node --import tsx scripts/backend-setup.ts
docker compose --env-file host.env up -d web
docker compose --env-file host.env exec -T web mkdir -m 700 -p /data/receipts
docker compose --env-file host.env exec -T web node --import tsx scripts/tateway-mcp-setup.ts --url http://127.0.0.1:3000 --data-dir /data --plan deployments/tateway-auto/workspace-plan.json --out /data/receipts/first-preview.json
```

Read the private preview receipt and reviewed `workspace-plan.json`. Then apply
with a new receipt name:

```sh
docker compose --env-file host.env exec -T web node --import tsx scripts/tateway-mcp-setup.ts --url http://127.0.0.1:3000 --data-dir /data --plan deployments/tateway-auto/workspace-plan.json --out /data/receipts/first-applied.json --apply
docker compose --env-file host.env exec -T web node --import tsx scripts/backend-smoke.ts
```

The helper invokes the native stdio MCP: capabilities/catalogs, exact workspace
preview/apply digests, `website_command` form setup and tested staff follow-up,
then `shop_command` for reviewed clerical automation. Re-running preserves
existing owner settings and providers; use new receipt filenames. It does not
create sample customers, repair authorizations, consent, charges or live sends.
The private MCP configuration remains inside `/data/mcp-client.json`; do not use
`--print-token` or export that credential into a browser. Never apply the demo plan.

The single `shop-worker.ts` supervises native form tasks, invoice preparation,
reminders, payment reconciliation and communications. Do not also start the old
workflow, website-payment or Shopify workers for this deployment. Confirm actual
pending work and message history before enabling any outbound channel.

## Publish and verify HTTPS

```sh
docker compose --env-file host.env up -d web worker proxy
docker compose --env-file host.env ps
curl --fail https://portal.tatewayauto.com/api/shop-health
curl -sS -o /dev/null -w '%{http_code}\n' https://portal.tatewayauto.com/api/backend
```

Health must return only `{"status":"ready"}`; unauthenticated backend access
must return 401. `setup_required` / `unavailable` return 503 and prevent initial
Caddy/worker startup. Health checks storage and configured owner access; it does
not establish worker progress, provider delivery or payment acceptance.

On the real HTTPS origin, verify owner sign-in (blank email for the owner), the
TateWay shop dashboard and protected financial/message screens. Use a clearly
fictional request to verify intake, native records and queue state while provider
dispatch is disabled. Confirm persistence after restarting web/worker. Verify the
actual certificate, browser cookies, allowed website origins, provider webhook
signatures and a restore rehearsal. Get Luke's visual acceptance of the live UI.

Connect TateWay's own Mailgun, Twilio and Stripe accounts through native
Connections only after account/domain/sender/webhook setup and explicit approval.
Test-mode and simulated receipts remain labeled; accepted is not delivered, a
Checkout URL is not paid, and provider receipts are not bank reconciliation.
SMS requires the displayed optional consent and current opt-out state. Review
uncertain sends against the provider before any new send; do not replay them.

Only after these HTTPS checks pass should the public Vercel site embed/link the
native form URL returned by `website_read`. Its allowed origins are the exact
apex and `www` HTTPS origins. Do not put a backend bearer in public HTML. Record
the Vercel change separately and verify a real browser submission end to end.

## Backup, update and recovery

Back up the **entire** private volume, including `workspace.sqlite`, branding,
`connections.enc`, `vault.key`, receipts, evidence and other native files. The
vault is encrypted; customer databases and original evidence are not generally
encrypted at rest. Keep an encrypted off-host copy and the off-host decryption
identity separately. Caddy's certificate volumes are separate operational data.

For a backup, stop every writer and prevent new public requests:

```sh
docker compose --env-file host.env stop proxy worker web
docker compose --env-file host.env ps
docker compose --env-file host.env --profile setup run --rm --no-deps -v /srv/tateway-backups:/backup initialize node --import tsx scripts/workspace-backup.ts backup /backup/UNIQUE_BACKUP_ID
```

Prepare `/srv/tateway-backups` privately for container UID 1000 first. The native
backup refuses existing targets and live WAL/SHM/lock files, validates SQLite,
and records checksums. Never delete those files to force a backup through. If a
writer did not stop cleanly, resolve it before proceeding. Encrypt the completed
backup before sending it to the approved off-host destination, for example with
an operator-installed `age` and the owner's **public** backup recipient:

```sh
tar -C /srv/tateway-backups -czf - UNIQUE_BACKUP_ID | age -r AGE_PUBLIC_RECIPIENT -o /srv/tateway-backups/UNIQUE_BACKUP_ID.tar.gz.age
sha256sum /srv/tateway-backups/UNIQUE_BACKUP_ID.tar.gz.age
```

No backup identity, off-host account or scheduled backup is supplied. Verify the
uploaded encrypted file's checksum and rehearse decryption/restore privately.

For an update, retain that stopped-writer backup and the previous source/image
identity. Build the reviewed new image, validate configuration, start web first,
check readiness/native MCP, then start worker/proxy. Restart retains the named
volume. Never run `docker compose down -v`, remove the volume, or reuse its name
for another business.

Restore into a **new** named volume. Preserve the old `host.env` privately; set
`SHUUG_WORKSPACE_VOLUME` to a new recovery volume name and `SHUUG_DATA_DIR` to
`/data/restored` in `host.env`, keeping every service stopped. Decrypt the archive
privately under `/srv/tateway-backups`; then:

```sh
node validate.mjs host.env
docker compose --env-file host.env --profile setup run --rm --no-deps -v /srv/tateway-backups:/backup:ro initialize node --import tsx scripts/workspace-backup.ts restore /backup/UNIQUE_BACKUP_ID /data/restored
docker compose --env-file host.env --profile setup run --rm --no-deps initialize node --import tsx --eval 'import { saveSecrets } from "./src/lib/connections/vault.ts"; saveSecrets({ COMMUNICATIONS_SEND_ENABLED: "false", SHOP_AUTOMATION_ENABLED: "false" });'
docker compose --env-file host.env --profile setup run --rm --no-deps initialize node --import tsx scripts/backend-setup.ts
docker compose --env-file host.env up -d web
```

Use `/data/restored` for subsequent MCP `--data-dir` / receipt paths. Verify
counts, consent/STOP state, invoice balances, provider receipts and message
uncertainty before restarting worker/proxy or reenabling dispatch. Native restore
checks every manifest entry and SQLite integrity and refuses an existing target.

Roll back code only to a data-compatible image. Never roll business data backward
over real provider activity and resume sending: a restored older queue may lack
later delivery/payment receipts. Keep outbound disabled, reconcile external
activity, and obtain an owner-reviewed recovery plan first. Preserve both the
failed state and backup; do not overwrite either to make a check pass.

## Validation performed

`node validate.mjs` parsed this profile with the installed Compose CLI and checked
the private volume, one worker, production auth, empty external database setting,
readiness dependencies and published ports. `health.test.mjs` exercised native
SQLite/vault readiness, missing setup and failure privacy (five passing tests).
No Docker daemon, VM, image build, container, DNS change, Caddy process, live host,
TLS certificate, provider send or charge was used for these package checks.
