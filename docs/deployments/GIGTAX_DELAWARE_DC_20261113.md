# Free Delaware and District of Columbia sources — November 13

Objective: extend the existing sales portal's free public business-record lookup
without changing nationwide town assignments or treating contact-place records as
ownership evidence. Canonical checkout: Worktrees/GigTaxProsSalesIntegrated-20261107,
branch feat/gig-tax-pros-sales-integrated, existing AgewellEPM/shuug-business remote.

## Sources and behavior

[Delaware Division of Revenue business licenses](https://data.delaware.gov/Licenses-and-Certifications/Delaware-Business-Licenses/5zy2-grhr/about_data)
provide published legal/trade names, business addresses, activity categories and
license dates. The state labels this feed public domain. This is separate from
the Division of Corporations entity registry and has no owner, phone or email
fields. The published DBA supplies the display name, preserving chain filtering;
both legal and trade names can match a reviewed business. Local discovery checks
the published license-validity interval. Selected records show the actual dates.

A license number can cover multiple locations or activities. Selected lookup
requires the matching complete office address, including its unit, and locality;
its source link includes the selected legal/trade name and address. A shared
license number alone cannot turn another location into a selected-office match.
Requests use a fixed field list, escaped literals, 501 discovery rows or 25 lookup
rows, a 15-second request limit and bounded successful-response caching.

[D.C. DLCP corporate registrations](https://opendata.dc.gov/datasets/5238c4fd99c843a1bd7679a243747a8c_0/about)
provide the actual filing number, business address, status and registered-agent
name. The separate [beneficial-owner table](https://opendata.dc.gov/datasets/c0c5d27952c84a6ca745556d0691d606_2/about)
is queried only for a selected filing. Owner rows must agree with that filing
number and normalized business name. Their names retain the official source and
source modification date, and remain unverified owner findings. Agent names stay
separate. Personal owner/agent addresses and source geometry are never requested.
The product displays DLCP/DC GIS attribution and CC BY 4.0. Sole proprietors and
unregistered businesses may be absent from the corporate table.

Discovery is limited to 501 source rows and 500 results. Lookup reads at most two
25-row business queries, six matching filings and 101 owner rows per filing,
returning at most 100 owner rows. Source limits and owner-source failures are
reported separately from an empty result. Existing directory results survive a
registry outage. All research tokens, territory checks and explicit review/save
behavior remain on the existing execution path.

## Verification and release state

The installed MCP before this change reported nine automatic-record regions and
manual status for both Delaware and D.C. Direct new-source reads returned 22
Dover license candidates and 137 Washington corporate candidates. Each selected
record round-tripped its source ID and exact public source link. The D.C. sample
returned one beneficial-owner name and one separate registered agent. These are
sampled source results, not complete operating-office counts.

All 217 sales/MCP checks and full TypeScript pass. Checks include published DBA
matching, chain display identity, same-license location/unit separation, source
schema failures, escaped queries, owner-row filing/name conflicts, omitted personal
addresses and the actual principal-to-contact-research token path. Historical
Iowa/Alaska and MCP coverage verifiers now compare the current declared coverage
instead of a stale hardcoded region count.

Implementation is prepared; deployment and installed-MCP acceptance are pending.
Prepared work and source receipts are under
~/BuildCache/GigTaxNationwide-20261112/delaware-dc-20261113.
The intended coverage is 11 automatic-record regions (AK, CO, CT, DC, DE, IA, NM,
NY, OR, PA, TX), ten with local registry discovery; 40 regions remain manual.

Town assignments remain live in all 51 regions and all 169 Connecticut towns.
Contact-place coverage remains separate from registry and owner coverage. No
real office, contact, salesperson, message or payment is created by verification.
Human Safari/phone acceptance remains pending. Mail is unconfigured and payments
are deferred. Preserve the unrelated How It Works receipt and parallel changes.
