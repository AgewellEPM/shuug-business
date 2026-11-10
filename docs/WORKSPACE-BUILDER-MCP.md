# Describe a business and configure Shuug through MCP

Luke's intended product is complete tax preparation, accounting and filing
software for independent firms, with a firm-owned Mac mini hosting option. The
earlier recommendation to make it a companion to another filing product was
not his requirement. This remains the product direction. The November 9 draft
pack now calculates selected 2025 federal individual/self-employed and entity
returns and populates official draft PDFs inside the independent encrypted client.
Complete filing-ready coverage and IRS/state transmission remain unfinished.

The correct workspace-building path is Shuug's own MCP interface. The original
server exposed 39 tools but not its existing industry builder. Three tools now
connect that builder to MCP, with generic data-driven workspace navigation:

1. `workspace_catalog({})` returns installed industries, questions, capability
   packs, exact tool IDs, tool dependencies and current product limits.
2. The connected assistant interprets the business description and chooses those
   installed capabilities. It calls `workspace_preview` with the description,
   industry configuration, primary/home tool IDs and optional visible-tool list.
3. The preview returns the proposed settings, visible/hidden tools, missing
   requested capabilities and review digests. It makes no configuration change.
4. `workspace_apply` takes the exact reviewed plan and both digests, saves the
   configuration and records a durable business-context receipt. Stale or changed
   plans fail. Exact retries are safe only while that configuration remains current.

The builder configures actual existing tools; it does not synthesize arbitrary
source code or implement a missing tax engine. The catalog reports the installed
draft calculation/form pack as partial and transmission as unimplemented.
Navigation visibility never grants
employee permissions, alters encryption enrollment or supplies provider authority.
Business descriptions must not contain taxpayer information, credentials or keys.

The workspace's home and primary navigation come from saved tool IDs. Roles,
feature visibility, organization profile and display preferences still filter
those destinations. A visible tool's declared supporting modules must remain
visible. For example Tax work and the document inbox require the engagement and
document-request modules; hiding those would make document operations unavailable.
The builder rejects that plan before applying it.

## Connect and use it

Keep the existing backend authentication and transport described in
[SHOPIFY-BACKEND-MCP.md](SHOPIFY-BACKEND-MCP.md). Shopify is optional. Read
`business_capabilities` and status first, then use the workspace tools. The server
now exposes 45 tools, including native `billing_catalog`, `billing_read` and
`billing_command`. Backend credentials authorize the whole selected workspace;
keep them in the private local vault or a trusted MCP client's secret settings.

`scripts/workspace-builder-mcp.ts` is a small client of the real stdio MCP server.
It does not replace the builder with local application calls. It reads the
selected workspace's configured backend key without printing it. Example:

```sh
node --import tsx scripts/workspace-builder-mcp.ts \
  --url http://127.0.0.1:PORT \
  --data-dir /absolute/private/workspace \
  --plan business-plan.json --out NEW-preview.json
```

After inspecting that preview, repeat with `--apply --current-digest HASH
--proposed-digest HASH` and a new receipt filename. Both hashes must come from
the exact reviewed preview. Remote origins require HTTPS. Configure access with
`backend:setup` first; do not paste tokens into command arguments or chat.

The plan contains `{description, industry, layout, visibleToolIds?, businessName?,
requiredCapabilityIds?}`. Required capabilities stay attached to the preview and
receipt, with separate implementation, configuration and live-verification status.
A configured menu does not mark a requested capability complete.
`industry` uses the existing installed industry contract.
`layout` is `{homeToolId, primaryToolIds}`; choose one to twelve unique installed,
visible primary IDs including the home ID. The root home tool is not itself a
valid redirect target. The optional visible list hides other catalog items,
without deleting their records or changing access control. Requested supporting
tool IDs must be included in that explicit list.

## Tax-workstation demonstration

The actual MCP business brief asks for complete professional tax/accounting/filing,
individual/self-employed/business returns, secure client documents, bookkeeping,
review, invoices, quarterly work and a local Mac mini. It requests hiding unrelated
retail, restaurant and manufacturing tools. It also requires gaps to remain visible.

The generated primary destinations are Tax work, Clients, Tax document inbox,
Client books, Firm invoices & bills, Client access & invitations and Calendar.
Sample clients/books/PDFs stay
fictional. This is a configuration of the existing Shuug application, not a
separate custom tax homepage or a completed tax-return engine.

The exact demonstration recipe is
[`examples/workspaces/tax-accounting.sample.json`](../examples/workspaces/tax-accounting.sample.json).
It includes the supporting engagement/document modules. Review and adapt the
SAMPLE name and all tool selections before using it for a real firm's workspace.

The ordinary installed service and real data are not changed by the demo. Its
loopback-only sample runtime is explicitly labeled SAMPLE and left open at Luke's
request. Visual acceptance requires his screenshot. Public marketing pages,
provider accounts, payments and filing are outside this demonstration.

## Billing and the encrypted client portal

The native billing MCP tools use the same books, invoice revisions, ledger and
authorization as the application. They support reviewed draft/post/void, private
invoice links, partial settlements, payment connection status and invoice email.
Manual settlement evidence records an asserted payment; it does not move money.
The command tool declares external effects because reviewed email sending can
contact Mailgun. Never infer permission for a real email or charge from a demo.

Invoice delivery requires a configured Mailgun domain/sender, vault-held key,
explicit test/live mode and a public HTTPS application origin. Preview binds the
exact recipient, posted invoice revision and private link. Sending records one
durable attempt before contacting the provider. An uncertain response requires
reviewed outcome resolution; retrying never blindly sends another email. Provider
acceptance is shown separately from confirmed delivery. Stripe checkout and its
verified payment receipt remain the existing online-payment path.

The separately distributed trusted encrypted client now has a multi-file inbox,
readable records and a 15-second refresh while signed in, unlocked, visible and
idle. It accepts PDF, JPEG, PNG and UTF-8 CSV, within the displayed limits. Failed
uploads retain ciphertext for exact retry after reload. Raw selected files stay
only in memory and are cleared on lock. Uploaded invoices and receipts remain
documents; they do not create paid balances or ledger entries.

This does not activate real client enrollment or place recovery/signing keys on
the hosting Mac. Signed sharing is still required for staff to open new client
objects. Full encrypted staff editing, a shared financial projection and instant
push updates remain incomplete. The required capability statuses report those
limits rather than treating a document counter as the client's whole business.
