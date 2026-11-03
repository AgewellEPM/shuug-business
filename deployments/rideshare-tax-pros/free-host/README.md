# Free hosting for Rideshare Tax Pros

Luke requires free hosting and selected Cloudflare Pages for the public website.
Shuug's existing accounts, SQLite workspace and encrypted connection vault stay
on a persistent server volume. The public static site contains no account data.

## Public website: Cloudflare Pages

From the repository root:

```sh
npm run site:rideshare:cloudflare
```

This creates `deployments/rideshare-tax-pros/.cloudflare/output` with 19 pages,
clean HTML routes, a custom 404, security headers, robots.txt and a sitemap for
`https://rideshare-tax-pros.pages.dev`. Set `RIDESHARE_SITE_ORIGIN` before the build
if Cloudflare assigns a different project hostname. The origin must be HTTPS.
No Pages Functions or paid storage services are part of this build.

Authorize Cloudflare using Wrangler's normal OAuth flow, then create or select
the Pages project and publish the output directory. Check the actual account and
project before writing. A built directory does not establish publication.

```sh
npx --yes wrangler@4.156.2 pages deploy deployments/rideshare-tax-pros/.cloudflare/output --project-name rideshare-tax-pros --branch main
node scripts/verify-rideshare-site.mjs --cloudflare
```

The verifier checks the built manifest's real origin. It excludes Cloudflare's
reserved `_headers` control file from public artifact requests and follows the
platform's clean-URL redirects. The existing Vercel build remains separate.

## Private Shuug: Oracle Always Free

Oracle's current Always Free allowance includes A1 compute and persistent block
storage. One A1 instance with 1 OCPU, 6 GB RAM and a 50 GB boot volume fits within
the published allowance, provided the tenancy has enough unused free capacity.
The allowance is shared across the account; confirm the console's Always Free
eligibility before provisioning. Do not select a paid shape or upgrade the
account. Capacity is region-dependent and idle instances may be reclaimed.

Account creation requires the account holder's identity verification. This
repository does not register the account or provision billable infrastructure.

Once an Always Free Ubuntu server exists, install Docker and its Compose plugin
there. Keep administration restricted to your own network address. The profile
publishes only HTTP/HTTPS; the Node application port remains inside Docker.

Use a public hostname resolving to the server. An IP-based DNS name such as
`shuug.<SERVER-PUBLIC-IP>.sslip.io` can avoid buying a domain, but DNS resolution,
public reachability and certificate issuance must be verified for the actual
server. No hostname or certificate has been provisioned by this package.

From this directory on that server:

```sh
cp host.env.example host.env
# Set SHUUG_PUBLIC_HOST in host.env to the actual public hostname.
docker compose --env-file host.env build web
docker compose --env-file host.env --profile setup run --rm initialize
docker compose --env-file host.env up -d web proxy
```

The setup command prompts for the new server's owner password with hidden input.
It uses an empty private volume, imports the Tax Firm template and enables invited
client service access. Repeated setup preserves the password and later owner
settings. An unrelated volume or changed public origin fails for review. The
setup container has no network access. No local Mac credentials or real client
records are copied to the server.

The web image runs as the existing unprivileged Node user. The named `workspace`
volume holds the database, branding and vault. Caddy handles HTTPS and retains
its certificate data in separate named volumes. Initialize before starting the
web service; keep the named volumes during updates. Stop app writers before
using the existing workspace backup/recovery commands, and retain private backups
outside the source checkout and the public website artifacts.

After actual HTTPS owner sign-in, client invitations/isolation, persistent restart
and recovery checks pass, configure the public site's `workspaceUrl` with
`https://<ACTUAL-HOST>/api/website/customer` and rebuild. Source preparation and
Compose validation do not establish a working public client deployment.

## Source references

- [Cloudflare static asset pricing](https://developers.cloudflare.com/pages/functions/pricing/): static asset requests are free; this site uses no Functions.
- [Cloudflare serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/): clean HTML routes and custom 404 handling.
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm): current compute/storage allowances, shared limits and idle reclamation.
- [Oracle signup FAQ](https://www.oracle.com/cloud/free/faq/): identity verification and free-tier account behavior.
- [sslip.io / nip.io](https://sslip.io/): IP-derived DNS hostnames.
- [Vercel and SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel): local persistent SQLite is not supported by Vercel Functions.
