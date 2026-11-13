# Nationwide published business-contact catalogue — November 13

Deployed and verified at https://gigtax.pro/sales. Human visual acceptance remains pending.
Canonical checkout: Worktrees/GigTaxProsSalesIntegrated-20261107.
Branch: feat/gig-tax-pros-sales-integrated. Existing remote: AgewellEPM/shuug-business.

## Behavior

The existing state → town/city → salesperson assignment flow remains independent
of contact-source coverage. All 50 states/DC and 169 Connecticut towns were already
deployed. This change adds a free public source for reviewing office websites,
business phones and business emails in both Find offices and saved-office research.
It does not add verified owners or establish that a channel reaches a named person.

A name and locality match can suggest a website. Contact-field proposals require
the matching business name and complete normalized street (including suite/unit),
a related tax-business name at that street, or the same meaningful business name
and a matching non-toll-free published phone. State and locality must agree.
Address-only matches never provide contact proposals. Websites still need review.
Existing actor, territory, suppression, expiring token, fingerprint and conditional
save protections remain. Catalogue lookup alone never writes a CRM record.

Each result carries the Overture record link/ID, snapshot release and source
observation dates. A lookup timestamp is explicitly separate from verification.
Saved-office proposals preserve these fields in the existing reviewed source
history. The map form can prepare selected reviewed details and download the full
research record; saving remains explicit. First-party website evidence takes
priority over the additional catalogue proposals.

The shared legacy web-search provider collapses empty results and provider/parser
failures to the same empty array. The adapter now reports that as unconfirmed,
preserving existing directory details and manual business-search links. Catalogue
website matches avoid that dependency. No new scraper or paid account was added.

## Source and reproducibility

Source: [Overture Places](https://docs.overturemaps.org/guides/places/), explicitly
pinned release 2026-10-21.0. Anonymous public S3 ranged Parquet reads use existing
pyarrow 21. The builder selects US accountant, tax_service and bookkeeper records
with a usable public business channel; it excludes permanently closed records,
missing locality/street/state, government tax offices, tax law, taxis and taxidermy.
It does not download the full worldwide data or infer personal identities.

Run scripts/sales/build-business-places.py with --release, --cache and a new
--output directory. At most two source-file workers, bounded row groups and source
bytes, resumable checkpoints tied to builder SHA/source ETag, deterministic gzip
shards, per-state SHA-256 and a source manifest make the snapshot reviewable.
Server loading verifies each shard, bounds decompression and caches four states.
Source point coordinates open the original record only; existing address geocoding
continues to supply pins.

The catalogue is licensed public source data, not a CRM/private research export.
Full CDLA Permissive 2.0, Apache 2.0 and CC0 texts, contributor attribution and the
complete Foursquare notice are in public/rideshare-tax-pros/business-data-attribution.txt
and accompany packaged data as NOTICE.txt. Modifications are disclosed there.

## Acceptance and remaining work

Focused matching, source-integrity, web-search failure, review-token and UI checks
cover false merges, source dates, explicit save and preserved ownership flags.
The nationwide live verifier uses the installed MCP to compare deployed coverage
and actual directory-to-catalogue matches in one locality per state. It saves only
counts and evidence status, no contact exports, and checks saved records unchanged.
Artifact verification preserves existing public pages, routes, headers and CSP.

The complete snapshot contains 102,768 place/address records across 51 regions:
75,123 with websites, 95,290 with phones and 17,945 with emails. The compressed
catalogue is 12,463,735 bytes; selected source columns totaled 2,341.7 MiB.
All 209 sales/MCP checks, four builder checks and full TypeScript pass. All state
shards load with verified hashes; 153 sampled exact source-record matches pass.
The artifact guard verifies the 461-file current baseline and prepares 678 files,
preserving 87 protected static files plus all existing routes, headers and CSP.
Only private research UI/scripts and their backend modules change; the added
public attribution text contains source notices and licenses.

Prepared release: ~/BuildCache/GigTaxNationwide-20261112/release-business-places-final-20261113.
Preservation receipt: gigtax-business-places-preservation-20261113.json.
Test log: /private/tmp/gigtax-business-places-tests-20261113.log.
Source 9a8b7058f1a8de2ba45bc8be8e40fadb7fbc8a52 is GitHub-SHA-verified.
Ready deployment dpl_CSw4cdSwU57ou3GyTJmn5hfhD5KB serves the production domain.
All 678 uploaded artifacts, 105 static HTTP files and 87 protected static files
match the prepared release; routes/headers/CSP are unchanged. The installed MCP
checks pass for authentication, Hartford map/principal/contact research, pipeline,
contracts and commission rates. Hartford remains 170 candidates/121 mapped
addresses; the known official website reader still returns a sourced business
phone from two checked pages.

The nationwide installed-MCP probe passed all 51 regions. In every sampled
locality it found catalogue website suggestions and verified a selected source
record with its snapshot and observation dates. Selected businesses were all
non-chain candidates. This proves sampled cross-source matching, not complete
business coverage: Hartford had 22 catalogue matches among 170 candidates,
16 with website suggestions and ten with sufficiently matched contact evidence.
The earlier Albany Accounting sample still has no automatic website suggestion;
manual confirmed-site reading works. Empty legacy search now reports unavailable
rather than asserting that no result exists.

Evidence: gigtax-business-places-live-20261113.json and
gigtax-business-places-deployed-live-20261113.json. Saved offices, agents and
contacts remained unchanged (all zero); no outreach, paid provider or payment.
All owned extraction/verifier processes completed and MCP children closed.
Human Safari/phone visual acceptance remains Luke's. Mail is unconfigured and
payments deferred. The wider connect-all goal remains incomplete: automatic
selected-record registry coverage is nine states and the other 42 regions remain
manual; business-contact place coverage does not replace registry/owner records.
