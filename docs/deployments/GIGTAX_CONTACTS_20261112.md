# Office owners, Rolodex and Shuug MCP — November 12, 2026

The private sales workspace now stores multiple people per office and exposes an
**Owners & Rolodex** view. It includes owner/partner and staff roles, business
email, phones/mobile/extension, title, preferences, relationship notes, source
checks, primary-contact selection, archive/restore and missing-information filters.
The existing invitation form can select a saved owner independently of the primary
conversation contact. Imported directory names remain unconfirmed.

Implementation: `c9f220d595864625392459d9c9f96aa8eedeefe4`, with final archive
compatibility fix `461dc62d88a546e23ccc53334fba329f72cf8c16`. Both source commits
were pushed to `AgewellEPM/shuug-business`, branch
`feat/gig-tax-pros-sales-integrated`, and their remote SHAs verified.

Ready production deployment: `dpl_CaZtZTPJ2JeuLMSURpLgyZQsUy5D` at
https://gigtax.pro/sales. Prepared release:
`/Users/lukekist/BuildCache/GigTaxContacts-20261112/release-final`.
Rollback reference is the immediately previous verified private release
`dpl_6p1LUPYYV8fdsJvT6vLraoziGV3E`; the original pre-contact deployment is
`dpl_CfeDYTeMqZZTpH7hK3xYGqp1EsF7`.

## Verified behavior

- 143 focused sales/backend/DOM/MCP/packaging tests pass, zero failures/skips.
  TypeScript passes after generating the existing Next route types.
- The shipped UI creates an owner and manager through the real handler, searches
  them, reloads their saved records, selects the primary, and archives/restores.
  Source edits invalidate prior checks across both new and existing forms.
- The actual native `shuug-business` stdio MCP server executes contact commands
  through HTTP against that same handler. Exact retries, denied assignments and
  revoked credentials are covered. Three optional tools are `sdr_catalog`,
  `sdr_read` and `sdr_command`; ordinary business tools are unchanged by default.
- Actual Worker/D1 persistence uses only disposable synthetic boards. Fresh
  adapters read the stored owner/source/primary and manager; stale edits fail,
  archive/restore retains history and unassigned agents cannot read the contacts.
  All eight diagnostic boards from both persistence runs were archived and
  cleanup verified. No real pipeline records were written.
- The final published release matches all 137 uploaded artifact hashes and all
  88 static HTTP responses. All 82 protected public files retain their bytes and
  headers. Routes/CSP remain exact. The final archive fix changes only the contact
  module in the three existing function packages.
- Production Rolodex requests require sign-in and reject a foreign origin. The
  installed private MCP launcher reads the actual deployed workspace and Rolodex
  consistently: **zero offices, zero agents, zero contacts**; payments unconfigured.

The launcher `~/bin/gigtax-sales-mcp` and private client configuration
`~/.config/gigtax-sales/mcp-client.json` are installed from tracked source. Codes
stay in private local files and are never put in source, URLs or probe output.
Global MCP settings and existing local business services were not reconfigured.
Connection and recovery instructions are in [GIGTAX_CONTACTS_MCP.md](../GIGTAX_CONTACTS_MCP.md).

Evidence: `gigtax-contacts-{checks-final,preservation-final,live-final}-20261112.json`
and the two `gigtax-contacts-backend` receipts. Earlier checks, preservation and
first-deployment evidence remain historical records.

## Remaining boundaries

The user explicitly chose **Build the tools only for now**. No real office list
was populated, person researched, message sent, invitation created or payment made.
Payments remain deferred; email delivery is still unconnected. Source checks do
not establish deliverability or independent office ownership. Production checks
were read-only; real writes were limited to diagnostic D1 boards and synthetic
UI/MCP fixtures. Human visual acceptance and physical-phone use remain unverified.

The unrelated untracked `gigtax-how-navigation-http-20261107.json` was preserved.
No diagnostic HTTP/MCP helper or guest is intended to remain running. The owner
workspace is left open in normal Safari for review.
