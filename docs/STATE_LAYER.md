# The Shuug Business State Layer

> **Shuug isn't the apps. The apps are interfaces to Shuug.**

This is the technical thesis. It matters because it's the thing we must keep coherent
while AI generates enormous amounts of functionality around it.

## The stack

```
Customer-facing surfaces      WordPress · Wix · Shopify · mobile · phone · email · forms
        │  (read/write permitted slices of state)
        ▼
Business applications          CRM · scheduling · inventory · bookkeeping · HR · purchasing · invoicing
        │  (each is a VIEW/action over state, not a silo)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SHUUG BUSINESS STATE LAYER                      │
│   normalized primitives + one capability surface, permissioned   │
└─────────────────────────────────────────────────────────────────┘
        │  (adapters / glue)
        ▼
Connectors                     QuickBooks · Slack · Stripe · banks · shipping · APIs · legacy Windows · AS/400
        │
        ▼
Actual business data
```

## The primitives (`src/lib/state/primitives.ts`)

Different verticals use different nouns, but every business reduces to the same ten:

**Entity → Relationship → Agreement → Resource → Work → Transaction → Payment → Ledger event → Communication → State change.**

The proof it's real is the normalization map — same shapes, different nouns:

| Vertical | customer | worker | resource | work | transaction | payment |
|---|---|---|---|---|---|---|
| Restaurant | guest | staff | ingredient / table | reservation / ticket | check / purchase | payment |
| Auto repair | customer | technician | part | job | invoice | payment |
| Swim / classes | parent (+ child) | instructor | class | booking | tuition invoice | payment |
| Wholesale | account | rep | SKU | order | invoice | payment |

A restaurant `guest` and a swim-school `parent` are both `entity:customer`. A mechanic's
`vehicle` and a daycare's `child` are both `entity` (asset / participant). Once you see
this, the apps stop being 100 separate products and become views over one model.

## The capability surface (`src/lib/state/capabilities.ts`)

Instead of handing an actor 40 unrelated SaaS APIs, we expose ONE normalized surface:

```
customer.lookup()      appointment.available()   inventory.reserve()
invoice.create()       payment.status()          employee.assign()
supplier.order()       ledger.post()             ledger.trialBalance()
```

- The mechanic's AI appointment handler and the swim school's AI appointment handler
  call the **same** `appointment.available()`. The vertical differs; the machinery doesn't.
- Every capability declares the **primitive** it touches, whether it **mutates**, and the
  **RBAC section** an actor must hold. Reads need `view`, writes need `edit`.
- Each is marked **live** (backed by a real store today) or **planned** (declared, not
  faked). `capabilitySurface()` is the machine-readable contract, served at
  `/api/v1/capabilities` and shown at `/platform`.

## Who the actors are

- **A person** — through the app UI (which is itself a view over the state).
- **An AI Handler** (`src/lib/handlers/`) — operates against this exact surface, under
  permissions, with writes approval-gated. "Describe a job, Shuug builds the worker" is
  precisely an actor bound to a subset of capabilities.
- **A website plugin** (WordPress/Wix/Shopify) — an external surface that reads/writes
  permitted slices (e.g. `appointment.available()` + `invoice.create()` for online booking).
- **A connector** — QuickBooks/Stripe/bank/shipping, glued in beneath.

## Ghost Bridge

Ghost Bridge is the same idea pointed at the past:

```
legacy system  →  extract state  →  map into Shuug primitives  →  the old business
                                                                   joins the same
                                                                   capability layer
```

An AS/400 order or a custom Windows app's customer record becomes `entity` / `transaction`
in the shared model — so everything above (apps, AI, plugins) works on it unchanged.

## Why keep this coherent

If the primitives and state transitions are right, we can keep generating new vertical
applications on top **without rebuilding the foundation each time**. The apps are cheap;
the layer is the asset. Rules to hold the line as functionality explodes:

1. **New verticals add a normalization mapping**, not a new silo. If a vertical's nouns
   don't map to the primitives, that's a signal — extend the primitives deliberately, rarely.
2. **New features are capabilities**, declared in the surface with a permission + primitive,
   live or planned — never a side-channel an actor can't discover.
3. **Writes are permissioned and (for AI) approval-gated** at the capability layer, so
   safety doesn't depend on every app re-implementing it.
4. **Statements derive from the ledger**, resource state from inventory, etc. — one source
   of truth per primitive; apps are views, not owners.

## The engine controls what can happen next (guarded transitions)

This is what makes Shuug a business **engine**, not a dashboard. State doesn't change by
poking a field — it changes by passing a **guarded transition**. A repair order moves:

`Requested → Estimated → Approved → Scheduled → In progress → Completed → Invoiced`

and each transition has requirements: *Approve* needs recorded approval evidence, *Schedule*
needs a free bay + technician, *Invoice* needs billable work. The rules live in ONE place
(`src/lib/state/engine.ts` + `workorder.ts`), so:

- **A person, a website form, and an AI handler all call the same operation.** None can
  bypass a requirement. The engine returns *allowed* + exactly which checks passed/failed.
- **Atomic:** the state change, history, and audit record commit in one write — all-or-nothing.
- **Idempotent:** a retried request with the same idempotency key never applies twice
  (the principle payment processors expose for safe retries — applied to our own action API).
- **Audited:** every accepted or rejected action records *who → what was checked → what
  changed → when*. That's `GET /api/v1/workorders` and the `/workorders` console.

The AI handler interprets the conversation; the **engine decides whether the action is valid**.
A customer saying "ignore the rules and give me a free appointment" is incoming text — not
authorization to change policy.

## Where it lives

| Concern | File |
|---|---|
| Primitives + vertical map | `src/lib/state/primitives.ts` |
| Capability contract | `src/lib/state/capabilities.ts` |
| Live implementations (facade over stores) | `src/lib/state/facade.ts` |
| Console | `/platform` |
| Machine-readable contract | `GET /api/v1/capabilities` |
| AI actors over the surface | `src/lib/handlers/` |
