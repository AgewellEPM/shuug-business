# Office owners, contacts and Shuug MCP

The private `/sales` workspace has an **Owners & Rolodex** view. Each assigned
office can retain multiple owners, partners, managers and other business contacts,
including business email, office/mobile phone, extension, title, contact preference,
relationship notes and source evidence. Search covers people, offices and locations;
filters show owners, missing email/phone, unchecked roles, suppressed contacts and
archived people. Coverage counts describe saved records, not verified identities.

Open an office and use **Add owner** or **Add contact**. A named owner role remains
unconfirmed until the agent explicitly checks and saves the source URL and reason.
Changing checked identity/details invalidates the check. Existing discovery and
research contacts appear automatically without a data migration. Source checks made
in the existing office form and Rolodex stay consistent.

Choose **Make primary** to use that person in the existing office conversation
tools. The invitation form can select a saved owner separately. Archive/restore
retains the record and office history. An archived primary is cleared from the
conversation fields. Office suppression and the primary person's do-not-contact
preference block research, drafts and invitation/activation paths; the contact book
remains editable for corrections. Contract delivery and progress tools are
documented in [the workflow handoff](deployments/GIGTAX_PIPELINE_WORK_20261112.md).

Contact records use the existing private TinkySDR/D1 office metadata and conditional
updates. No second CRM database or separate customer workspace is created.
Agent assignment, territory and revoked-access rules apply to UI and MCP alike.
Every mutation requires the read office revision and a UUID request ID. An exact
retry is recognized while retained among the latest 30 contact commands; a changed
request or stale edit fails. Limits are 50 retained people per office and 48,000
characters of total office metadata, below the existing backend ceiling.

## Actual Shuug MCP connection

The existing `scripts/mcp-server.ts` and `createBusinessMcp` expose six optional
native tools: `sdr_catalog`, `sdr_read`, `sdr_command`, `sdr_progress`,
`sdr_contract` and `sdr_sender`. The ordinary business MCP
catalog remains unchanged unless its sales connection is selected. Sales-only mode
exposes just these tools under the existing `shuug-business` server identity.

Install the credential-free launcher/configuration:

```sh
node scripts/sales/install-mcp.mjs
```

This installs `~/bin/gigtax-sales-mcp` and
`~/.config/gigtax-sales/mcp-client.json`, preserving differing existing files.
No global MCP configuration is modified. The launcher reads the existing private
owner-code file at runtime; no key is put in a URL, source file or client response.
For an agent, explicitly set `GIGTAX_SALES_EMAIL` and `GIGTAX_SALES_CODE_FILE` to
that agent's private credential. The production default is `https://gigtax.pro`.
Remote origins require HTTPS and redirects are rejected. Each MCP operation signs
in with its sales identity and clears its local session cookie after the call.

Read `sdr_catalog`, then `sdr_read` with `resource: "office"` and the office ID.
The returned `contacts.revision` is the next command's `expectedRevision`.
Commands are `save-contact`, `set-primary-contact`, `archive-contact` and
`restore-contact`; they accept the office ID, contact ID and UUID request ID.
Saving a new person uses a fresh UUID contact ID. A legacy person can have ID
`office-contact`. The tool's schema provides exact field and role choices.

`sdr_command` saves contact records. `sdr_progress` records contact, reply, waiting
and next-step facts with the current office revision. `sdr_contract` prepares or
retrieves agreements, previews the exact email, explicitly sends through a
configured provider, or records reviewed manual-send evidence. A preview does not
send mail. `sdr_sender` reads/saves shared and agent sender identities; it does not
create email accounts. Read `sdr_catalog` for the current typed commands.
No real prospect population or actual outreach was performed. Payments remain
deferred; these tools cannot activate membership or move money.

## Verification and release boundary

Find offices also offers **Find business contacts** for any directory office and
**Find this person’s business contacts** for a listed registry principal. Existing
directory contacts retain their public source. Website search returns possible
sources and manual search links; choosing a website requires reviewing its business
match. The bounded contact reader visits public contact pages and reports extracted
email/phone/name evidence with source URLs and timestamps. It does not guess email
addresses, bypass logins, or treat an office channel as the named person’s direct
contact. Missing information stays unknown. Search/provider outages are shown.

Choose individual evidence fields, check their sources and prepare the existing
office form; saving remains a separate action. Research can be downloaded with its
sources. No contacts are automatically saved and no outreach is sent. Saved office
suppression also blocks map contact research. Registry matches require a meaningful
business-name or full tax-business-address match; a shared street number is not a
match. Nationwide IRS office search is available; automatic registry lookup is CT.

MCP `sdr_read` resource `contact_research` accepts `candidateToken` containing the
`researchToken` returned for a directory office, matched business or listed principal.
Without `website`, it returns published details and possible source links. Supply
`website` and `websiteReviewed: true` to read a checked official business website.
Tokens are bound to the authenticated actor, territory and one-hour expiration.
The launcher loads the current source; no global MCP configuration changes are needed.

Focused backend tests cover old records, source checks, compatibility with existing
forms, concurrent edits, retries, assignment/territory access, suppression, storage
limits and archive/restore. The shipped DOM flow uses the real API handler. The
actual stdio MCP test uses the same handler over HTTP, including revoked access.
Real Worker/D1 persistence is checked only in disposable synthetic boards, with
archive cleanup verified. These checks do not establish human visual acceptance.

`scripts/sales/prepare-pipeline-release.mjs` compares the candidate with the actual
production artifact inventory. Only specified private assets/modules, the one mail
callback route and an exact Agent sign-in footer link may change. Other public
content, media, routes, CSP and headers must match exactly; payment implementation
cannot change. The earlier contacts-only guard is unsuitable for this newer build.
Live HTTP and MCP reads are verified
separately after deployment. No browser runtime or VM is required.
