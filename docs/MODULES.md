# Building modules

Shuug Business is extensible by design. A **module** is a self-contained feature —
its own data, summary panels, API, and UI. There are two ways to build one, and
both are first-class citizens: they get the same navigation, permissions, API, and
record UI as anything shipped in the core.

## 1. No code — anyone

Go to **Setup → Tools & custom trackers** (`/features`). Name a tracker, add fields
(text, notes, number, money, date, choice, checkbox), and start entering records.
No developer required. This is the fastest path for a power user who just needs to
track something the app doesn't cover yet.

## 2. Code — developers

Write one file. The manifest is validated at import time (fail-fast), and
registering it wires up everything else automatically.

### Step 1 — create `src/modules/<your-id>.ts`

```ts
import { defineModule } from "@/lib/sdk/module";

export default defineModule({
  id: "service-tickets",        // kebab-case, globally unique → becomes /m/service-tickets
  label: "Service tickets",
  description: "Track support tickets to resolution.",
  group: "Sales",               // nav group the item appears under
  section: "sales",             // RBAC section that governs view/edit access
  version: "1.0.0",
  author: "You",
  fields: [
    { id: "subject",  label: "Subject",  type: "text",     required: true,  options: [] },
    { id: "priority", label: "Priority", type: "select",   required: true,  options: ["Low", "High"] },
    { id: "resolved", label: "Resolved", type: "checkbox", required: false, options: [] },
  ],
  // Optional: computed summary cards, pure functions of the records.
  panels: [{
    id: "open",
    label: "Open tickets",
    compute: (records) => [{
      label: "Open",
      value: String(records.filter(r => !r.archived && r.values.resolved !== true).length),
    }],
  }],
  // Optional: a pure JSON payload served at /api/v1/m/service-tickets
  api: (records) => ({ open: records.filter(r => !r.archived).length }),
});
```

### Step 2 — register it in `src/modules/index.ts`

```ts
import serviceTickets from "./service-tickets";
export const registeredModules: AppModule[] = [ /* …existing…, */ serviceTickets ];
```

That's it. You now have:

- **Nav item** in the chosen group (respects org-type + white-label visibility).
- **Permissions** — the module's `section` gates it via the RBAC matrix. A role that
  can't view that section never sees the module; only roles with `edit` can mutate.
- **A full records UI** at `/m/<id>` — add/edit/archive/delete, driven by your fields.
- **An API** at `/api/v1/m/<id>` — records + your optional `api()` payload, authz'd
  and rate-limited like every other endpoint.
- **Durable storage** in `module-records.json`, validated with the same rules as
  the no-code builder.

## Field types

`text` · `notes` · `number` · `money` · `date` · `select` (needs 2+ options) · `checkbox`

## Rules the SDK enforces

- `id` is kebab-case and globally unique (duplicate ids throw at startup).
- `section` must be a real RBAC section.
- Field ids and labels must each be unique within a module.
- `select` fields need at least two distinct options.
- Panels and `api()` are **pure** — they receive records and return data; they never
  do I/O and a throwing panel is caught so it can't break the page.

## What lives where

| Concern | File |
|---|---|
| Public SDK (`defineModule`) | `src/lib/sdk/module.ts` |
| Types (pure, edge-safe) | `src/lib/sdk/types.ts` |
| Registry (nav/section adapters) | `src/lib/sdk/registry.ts` |
| Record store (durable) | `src/lib/sdk/records.ts` |
| Your modules | `src/modules/*.ts` + `src/modules/index.ts` |
| Runtime page | `src/app/m/[id]/` |
| Developer console | `/developer` |

`registry.ts` and `types.ts` are free of `node:fs` on purpose — they're safe to pull
into the edge middleware graph (permissions → catalog). Anything touching the
filesystem stays in `records.ts` and the server actions.
