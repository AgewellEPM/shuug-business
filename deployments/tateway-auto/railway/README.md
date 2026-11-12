# Optional Railway deployment

This prepares one dedicated TateWay service with one persistent `/data` volume.
It does not connect an account, create resources, incur provider fees, publish
DNS or activate messaging/payments. Keep the existing Vercel website unchanged
until this backend's HTTPS, owner sign-in and actual intake path are verified.

Railway's current documentation says new services cannot use `railway.json`;
legacy support ends December 1, 2026. The supplied JSON records the matching
build/deployment settings for review and legacy compatibility. For a **new**
service, configure those settings through the authenticated Railway tool or
dashboard, or author the current IaC format. Do not assume Railway will read this
file for a new service. [Current IaC rules](https://docs.railway.com/infrastructure-as-code).

## Service settings to review before provisioning

Use the reviewed private source repository at its root, `Dockerfile.backend`
(Node24), and start command `node scripts/shop-server.mjs`. Use one replica and
attach a new dedicated volume at `/data`; do not create a separate worker service.
The supervisor runs web and the single native shop worker in the same container,
sharing the SQLite database and vault. Caddy is not used; Railway handles public
TLS. Volume-backed redeployments can have downtime. [Volumes](https://docs.railway.com/volumes),
[healthcheck behavior](https://docs.railway.com/deployments/healthchecks).

Set these non-secret service variables:

```dotenv
APP_BASE_URL=https://portal.tatewayauto.com
DEALDESK_DATA_DIR=/data
NODE_ENV=production
AUTH_ENABLED=true
DEMO_DATA=false
DATABASE_URL=
RAILWAY_RUN_UID=0
```

Railway mounts volumes as root and documents `RAILWAY_RUN_UID=0` for non-root
images needing volume access. This profile therefore requires that container
permission setting; an alternative UID1000 volume-ownership arrangement must be
tested before using it instead. Do not copy Mac demo credentials or add a demo
owner gateway. Provider secrets belong in the native encrypted vault, not source,
public variables, build arguments, URLs, logs or chat. [Volume permissions](https://docs.railway.com/volumes#permissions).

Let Railway supply `PORT`. The supervisor listens on `0.0.0.0:$PORT`, enforces
production auth, an empty external database setting and `DEMO_DATA=false`, and
uses that port for native loopback checks. The reference JSON sets startup
health `/api/health`, timeout300s, failure restart10 attempts, zero overlap and
30s draining. Match these settings in the new service. [Deployment settings](https://docs.railway.com/config-as-code/reference).

## Private owner setup and native MCP

`/api/health` establishes web/data liveness so the initial container can remain
available for administrative SSH. It is **not** owner readiness. Initially,
`/api/shop-health` must return503 `setup_required`, owner login remains required,
and the supervisor does not start the worker. The worker starts only when that
native readiness check succeeds. No public bootstrap endpoint is added.

After the owner connects the intended Railway account/project and approves the
actual service, volume, region and cost, use an interactive `railway ssh` session
to that service. It supports a terminal for the native hidden-password prompt;
run these commands inside the deployed container. [SSH instructions](https://docs.railway.com/cli/ssh).

```sh
cd /app
node --import tsx scripts/workspace-setup.ts
SHUUG_BACKEND_URL="http://127.0.0.1:${PORT}" node --import tsx scripts/backend-setup.ts
node --import tsx scripts/tateway-mcp-setup.ts --url "http://127.0.0.1:${PORT}" --data-dir /data --plan deployments/tateway-auto/workspace-plan.json --out /data/receipts/railway-first-preview.json
```

Review the plan and private preview receipt, then apply with a new filename:

```sh
node --import tsx scripts/tateway-mcp-setup.ts --url "http://127.0.0.1:${PORT}" --data-dir /data --plan deployments/tateway-auto/workspace-plan.json --out /data/receipts/railway-first-applied.json --apply
SHUUG_BACKEND_URL="http://127.0.0.1:${PORT}" node --import tsx scripts/backend-smoke.ts
```

This uses the actual native MCP builder/forms/shop tools. No sample customers,
provider secrets, live sends or charges are installed. Never use `--print-token`
or put the private backend bearer in the public website.

After native owner setup, `/api/shop-health` must return200 `ready`. Verify the
actual HTTPS certificate, login, TateWay records, consent-aware intake, queue
state, native invoice/ledger behavior and persistence after restart. Then connect
TateWay's provider accounts privately and perform separately approved provider
checks. Only after HTTPS acceptance should Vercel link the returned native form.
Keep the apex and `www` DNS records on Vercel; use only the portal subdomain here.

## Lifecycle and recovery limits

An unexpected exit of either child stops its sibling and exits with failure for
the platform restart policy. SIGTERM/SIGINT stop both; an uncooperative child is
killed after20s, inside the reference30s drain. The supervisor logs generic
lifecycle messages and never prints its environment or credentials. Railway's
startup health probe is not continuous monitoring; inspect worker run/message
receipts and use an approved external monitor for operating evidence.

Use the [dedicated host backup/recovery rules](../README.md#backup-update-and-recovery).
On Railway, arrange a maintenance deployment with the volume mounted and **both
application writers stopped** before invoking native stopped-writer backup or
restore commands. SSH into an active writing service is not a backup gate.
Retain encrypted off-host backups and a separately stored decryption identity;
keep dispatch disabled during recovery and reconcile provider activity before
resuming. This package does not schedule backups or supply a maintenance service.

## Checks performed

`node --test deployments/tateway-auto/railway/supervisor.test.mjs` passes five
checks using actual disposable Node child processes: configuration, readiness
gating, child failure, graceful signal handling/forced cleanup, and spawn failure.
Fixtures open no ports and contact no providers; every owned PID was verified
gone. No Railway login, account change, container, VM, deployment or image build
was executed for these checks. Live volume permissions, SSH, platform signals,
TLS and deployment remain to be verified on the selected account.
