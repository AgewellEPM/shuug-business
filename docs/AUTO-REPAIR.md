# Auto repair: vehicles, VIN lookup and pricing

Choose **Auto repair shop** in Setup, then open **Services → Vehicles** (`/m/vehicles`). Branding controls the auto-repair capability pack and individual tool visibility. Employee Services view/edit permissions control access independently of visibility.

## Identify a vehicle

1. Create the customer under **Services → Clients**. Return to Vehicles and use **Refresh vehicles and clients** if it was already open.
2. Select an existing active vehicle, or choose to create one from a lookup. Enter its complete 17-character VIN and, when known, model year.
3. Confirm sending the VIN and optional year to NHTSA, then select **Look up VIN**. The fixed HTTPS request sends no customer, plate, mileage, fleet or note fields.
4. Compare the returned identity with the vehicle. A clean response supplies VIN, make, model and year. Errors, missing identity fields or a conflicting known year remain read-only and cannot be applied through the lookup.
5. Choose the actual service client, review registration, odometer, fleet reference and notes, confirm the comparison, then select **Save reviewed vehicle**.

Lookup alone leaves vehicle records unchanged. The apply proof belongs to the authenticated actor and expires after 15 minutes. A changed vehicle requires a fresh lookup. Exact successful retries return the saved vehicle without duplicating it or overwriting subsequent edits. The reviewed save rejects duplicate VINs, including archived records; restore an existing archived record before selecting it.

Saved review history retains the provider result, lookup and review times, reviewer, applied values and prior values. Later manual identity changes are visibly distinguished from the last reviewed decode. Reviewed vehicles can be archived; permanent deletion is rejected to preserve their history. Manual records remain available for older/incomplete identities and independently verified corrections. The duplicate/review checks describe the reviewed save path; manual entry is not provider verification.

## Provider and data boundaries

The integration uses the public [NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/), which provides manufacturer-submitted vehicle specifications. No provider API key is configured for this path. This does not establish ownership, condition, maintenance history or recall clearance. Staff must compare the result with the physical vehicle.

Requests have a 15-second timeout, bounded responses, no redirects and local limits of 10 lookups per actor and 60 per workspace per minute. Provider throttling or unavailable service leaves records unchanged. Only selected specification/status fields are retained; arbitrary provider fields are discarded. A non-clean result requires correction or independent manual verification.

Vehicle records and review evidence live in the private workspace SQLite data. Include the data directory and vault key in backups. Consultant template export includes the vehicle module dependency and selected capabilities; it excludes vehicle/client records, review evidence and credentials.

## Backend and MCP

Both MCP transports expose `vehicle_vin_lookup` and `vehicle_vin_apply`. Read `business_read` with `resource: "vehicles"` and `workflow_records` with `kind: "client"` before preparing a review. The same operations are available through authenticated `/api/backend` envelopes. Backend credentials authorize the whole deployment and share the backend actor; do not expose them to website visitors.

Lookup requires `vin`, nullable `modelYear`, nullable existing `recordId`, and explicit `consent: true`. Apply requires the returned `proof`, a UUID `requestId`, `reviewed: true`, and `details` containing `customer_id`, `registration`, nullable integer `odometer`, `fleet_id` and `notes`. Reuse the exact request ID and payload when retrying. A web user's proof cannot be applied as the backend actor or another employee.

## Labor rates and parts markups

The mechanic workspace now applies reviewed, versioned labor matrices and parts cost-band markups to real vehicle/client proposals. Minimum labor time, billing increments, per-unit rounding and reviewed tax inputs are captured with the amount. Proposals continue through customer approval, booked work, completion, exact fixed billing and recorded payment reconciliation. Explicitly shared pricing definitions travel in format-3 consultant templates and import as drafts. See [pricing setup, workflow and limits](AUTO-REPAIR-PRICING.md).

## Inspections and assigned technician work

[Vehicle inspections](AUTO-REPAIR-INSPECTIONS.md) now use published, versioned checklists, real employee assignments, timed work, measurements and point photos. Managers review outcomes and labor cost before completing the job. Shared reports are private to the matching customer account/portal. Format-4 consultant templates can include explicitly shared checklists alongside pricing definitions.

## Remaining mechanic work

The current mechanic workspace also has persistent inspection, labor-rate, parts-markup, fleet and reminder records alongside shared service workflows. Richer technician dispatch and repair execution, automatic reminder delivery, parts reservation/procurement, manufacturer specification feeds and separate repair tax-ledger posting remain unfinished. A generic record status does not establish completed inspection, approval or delivery. See the full [industry acceptance audit](INDUSTRY-AND-WEBSITE-ACCEPTANCE.md).

## Verify this path

Domain, route, form and actual MCP protocol tests run with disposable data and synthetic provider responses:

```sh
npx vitest run src/lib/vehicles src/components/vehicles
```

After a production build, the optional installed-app check makes live NHTSA reads using only the public example VIN embedded in its disposable fixture:

```sh
SHUUG_VERIFY_PUBLIC_VIN=1 npm run workspace:smoke
```

That check exercises real provider decode, reviewed save, competing requests, exact retry, a cross-process stale edit, the rendered vehicle page and template data exclusion. It starts and cleans up its own isolated backend data/process. It does not constitute visual acceptance or a live customer pilot.
