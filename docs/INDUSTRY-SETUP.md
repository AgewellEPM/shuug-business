# Set up around your business

Open **Setup → Start with your business type**. Search the first screen, **What do you run?**, and choose Auto repair shop, Restaurant, HVAC company, Landscaper, Wholesale distributor, Marketing agency, Community nonprofit, Gym, Salon, or Construction company.

Each template asks six or seven questions. Answers select reusable capability packs. For a mechanic, appointment scheduling, stocked parts, technician time, electronic estimates, fleet accounts and counter sales each change the tools shown. The QuickBooks answer adds connection guidance; account authorization is a separate step in Connect.

Use **Customize capability packs** for mixed operations. Add merchandise to a nonprofit, wholesale catering to a restaurant, or product sales to a mechanic. Give the template a name and revision, preview the shown/hidden tool lists, then apply. The preview must still match the current configuration when applied. Applying resets visibility overrides to the reviewed defaults and preserves business records, brand identity and employee permissions.

In **Branding**, adjust packs, whole sections or individual tools afterward. Individual switches override pack defaults within the enabled broad profiles. Navigation visibility is separate from role authorization; use Employee accounts and Roles & permissions to control access to shared work.

## Reuse a consultant template

Export in Branding, for example **Independent Auto Repair — v3**. Format version 2 includes the named revision, industry answers, selected packs, brand, custom tracker definitions and enabled SDK module IDs/versions. Another installation previews the import and checks that required module versions are installed. The file contains no business records, customer/employee accounts, credentials, payment configuration or executable extension code. When published repair pricing is explicitly marked for sharing, export uses format version 3 and adds those validated rule definitions and their module dependencies. Imported pricing starts as unshared drafts for local review; existing version 1 and 2 exports remain supported. Format 4 also includes explicitly shared published inspection checklists, imported as drafts for local review. See [reusable pricing rules](AUTO-REPAIR-PRICING.md).

The module SDK stores records in the private SQLite workspace database. Legacy `module-records.json` imports once; malformed legacy data fails without overwriting it. Include the complete data directory in backend backups.

## Current industry depth

Mechanic setup exposes service work alongside distinct vehicle, inspection, labor-rate, parts-markup, fleet-account and reminder records. Vehicles now support a real NHTSA lookup followed by staff review, client linking and preserved evidence; see [the vehicle workflow](AUTO-REPAIR.md).

Restaurant setup connects costed menus, ingredient lots, purchasing, reservations, floor/waitlist, online pickup, kitchen, payments, reviewed physical counts, specials, guest credits, shared accounting/daily close and employee scheduling. See [restaurant operations and limits](RESTAURANT.md). Nonprofit setup selects the existing donor, grant, program, volunteer, participant, funding and reporting workflows.

Reviewed mechanic labor/markup rules now create real itemized service proposals for customer approval and exact fixed billing. Versioned inspections now connect employee assignments, timed work, measurements/photos, reviewed labor costs and private customer reports; see [inspection setup](AUTO-REPAIR-INSPECTIONS.md). Advanced flows remain unfinished, including richer technician dispatch/repair execution, automatic reminder delivery, restaurant prep yields and course routing, multiple tax classes, payroll integration and external advertising attribution. A saved inspection or financial status in a generic module does not establish the corresponding completed approval/posting workflow. The full acceptance audit is in [Industry and website requirements](INDUSTRY-AND-WEBSITE-ACCEPTANCE.md).
