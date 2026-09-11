# Restaurant prep batches and measured yields

Choose **Restaurant** in industry setup, then **Operations → Prep batches & yields** (`/restaurant/manage?tab=prep`). The tool has its own visibility toggle in Branding. Operations view permits reading; Operations edit permits recipe and batch changes. Money access alone does not grant kitchen control. Finance retains the resulting journal entries without exposing prep recipes or batch notes.

## From ingredients to a prepared batch

1. Add each raw ingredient and the prepared output as separate ingredients, using grams, milliliters or individual units. Receive the raw stock with its actual landed cost and expiry information.
2. Create a prep recipe. Choose the output ingredient, expected quantity per batch, raw input quantities, preparation instructions and allergen notes. Use whole base units: an ingredient tracked in grams uses 1,000 for one kilogram. Unlike units are not automatically converted.
3. Choose the recipe and number of batches. Review the planned output and **actual input quantities**, enter a unique batch reference and supporting evidence, and start preparation. Inputs may differ from the plan, but each recipe input must be recorded once. Shuug allocates the earliest-expiring unexpired lots first. Insufficient stock rolls back the complete start, including any earlier ingredient deductions.
4. When preparation is complete, enter the **measured usable output**, the kitchen's reviewed use-by date and release evidence. The date uses the restaurant's calendar date, including overnight business days. Shuug does not calculate safe shelf life or certify food handling. The original recipe and measured inputs remain in the batch record.
5. Use the prepared ingredient in menu recipes or a later prep recipe. The finished lot immediately participates in availability, costing, kitchen consumption, expiry checks, waste and physical counts.

For example, consuming ingredients costing $5.11 with a plan for 400 grams and an actual output of 350 grams records 87.5% of planned yield. All $5.11 follows the 350 grams of prepared stock. Selling seven 50-gram portions consumes exactly $5.11 overall, with integer-cent allocations and the final remaining cent preserved. Yield compares the actual output with the planned output **in the same unit**; it does not add grams, milliliters and individual units together.

An unfinished batch may be marked **Discard the whole batch** with reviewed disposal evidence. It produces no usable stock and records the consumed food cost as a loss. For a completed batch that later spoils, use the existing ingredient-waste workflow. Normal cooking loss stays in the cost of the usable output. This release does not split one batch's cost between multiple products, partial discarded output, salvage or by-products, and it does not reconstruct raw ingredients by deleting a batch.

## History, stock and books

The batch preserves its recipe revision, input ingredient names/units, planned and measured quantities, source lot IDs and allocated cost, actors, evidence, start/completion dates, output lot and final result. Recipe edits affect future starts; a stale start must be reviewed again. Stock units cannot change after a prep recipe uses an ingredient. Disabling an output ingredient prevents completion until it is restored with its original unit.

| Event | Debit | Credit |
| --- | --- | --- |
| Start with measured raw stock | Food in preparation (1320) | Inventory (1300) |
| Complete usable prepared stock | Inventory (1300) | Food in preparation (1320) |
| Discard an entire unfinished batch | Food loss (6910) | Food in preparation (1320) |

Preparation creates no new supplier bill, payment, revenue or tax. Existing menu-order postings take the prepared ingredient through kitchen consumption and the completed sale. Food cost excludes labor and overhead. Prep can remain in progress across a daily close; completion or disposal posts in the current open business period and preserves the earlier close. No backdated batch mutation is permitted. Changing stock during a physical count makes that count stale and requires a recount.

Each command, stock movement, journal entry, audit event and UUID retry receipt commits in the shared restaurant SQLite transaction. Exact retries return the first result; a reused UUID with a different request is rejected. Batch references are unique even after completion or disposal. Two competing requests cannot consume the same last stock or finish the same batch twice.

## API and MCP

The authenticated `/api/restaurant/business` read includes `prepRecipes` and `prepBatches`; the corresponding POST accepts the usual `{requestId, action, input}` envelope. The browser endpoint requires the configured application origin and Operations edit. The existing MCP `restaurant_catalog` describes these same commands, and `restaurant_command` executes them using the authenticated backend credential:

- `prep.recipe.save`: create/edit/deactivate a reusable recipe; edits require its observed revision.
- `prep.start`: observed recipe ID/revision, whole-number batch count, unique reference, actual inputs, evidence and `reviewed: true`.
- `prep.complete`: observed batch ID/revision, measured output quantity, use-by date, evidence and `reviewed: true`.
- `prep.discard`: observed batch ID/revision, whole-batch disposal evidence and `reviewed: true`.

The hosted application and WordPress connector use the same backend. Prep is an employee workflow; it is not exposed as a public website mutation. No store account or external provider is required for prep.

Remaining restaurant work is tracked in [the full restaurant acceptance audit](RESTAURANT-ACCEPTANCE.md). Multi-location stock, unit conversion, partial loss/by-product costing, batch planning forecasts, temperature logs, supplier returns/credits and integrated labor/overhead accounting require further implementation.
