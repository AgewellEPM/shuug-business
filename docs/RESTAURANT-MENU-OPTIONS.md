# Restaurant menu options

Open **Operations → Menu & food costs** (`/restaurant/manage?tab=menu`). The menu editor's **Sizes, sides and extras** section belongs to the restaurant capability pack and follows the existing Menu visibility switch and Operations edit permission.

## Configure a menu item

Keep the standard per-portion price and recipe as the base. Add an option group such as Size, Side or Extras, give it a minimum and maximum number of choices, then define each choice:

- Name and availability.
- Price adjustment per portion, including zero or a negative adjustment.
- Reviewed allergen notes shown alongside the base menu information.
- Ingredient adjustments per portion, in the ingredient's stored base unit. Positive quantities add ingredients; negative quantities remove them. An empty adjustment list supports a preparation preference.

For example, an extra-cheese choice can add $2.00 and 10 grams of cheese. An omit-cheese choice can remove the base 20 grams and reduce the price by $1.00. The final selected recipe cannot have negative ingredient quantities, an empty recipe or a nonpositive price. Removing an ingredient does not erase the base allergen statement or certify an allergen-free preparation area.

A required side group uses minimum 1, maximum 1. Optional extras can use minimum 0 and a larger maximum. Configuration allows up to six groups, eight choices per group, four selections per group, twelve selections per portion and eight ingredient adjustments per choice. Required counts must be achievable. Ingredient units are fixed after use in an option, just as after use in a base recipe or receipt.

Saved choices have stable IDs. Editing a menu item increments its revision. Old menu-save clients that omit the option-group property preserve existing groups; explicitly sending an empty group list removes them from future orders. Existing accepted checks retain their captured choices and recipes.

## Staff ordering and kitchen work

Select the menu item, its choices and quantity on a check line. The choices apply to every portion on that line. Add another line to order the same item with different choices. Identical item/choice combinations should use a combined quantity.

**Create check for review** calculates price, special discount and tax on the server. The check captures each selected group's name, choice name, price adjustment and allergen notes, together with the complete resolved recipe. The staff member reviews it before sending it to the kitchen. A changed menu revision requires a new draft review.

Sending the check consumes the resolved ingredients from unexpired lots and captures their actual cost. All ingredient movements, kitchen tickets, journal entries and retry receipts commit together. A shortage in any selected variant leaves the entire command unapplied. Kitchen tickets display choices and allergen notes under the corresponding item, at the base item's station. Separate station routing for sides, course timing and changes to individual fired items remain further work.

Unstarted cancellation returns exactly the captured ingredients and value. After preparation begins, the existing whole-order cancellation rules record the captured food cost as waste. Changing the menu later never rewrites that accepted history.

## Online cart and WordPress

The hosted pickup menu displays active choices, their price adjustments and reviewed allergen information. Select a quantity and options, then either review the order directly or use **Add selected items and keep shopping**. Add a second version of the same item with different choices, remove a cart item if needed, and enter pickup/contact details for final review. Identical combinations merge quantities; different combinations remain separate lines.

The cart uses a signed, session-bound token that expires after 15 minutes. Building or reviewing a cart does not reserve stock, create an order or charge a card. The final review checks aggregate ingredient demand across all variants and other items. Placement repeats the terms, stock and pickup-capacity checks atomically. A successful placement retry returns the existing order.

The kitchen still reviews online dietary notes before cooking. Private pickup receipts retain the selected choices; customer cancellation before preparation restores their ingredients. The public menu, cart and receipt exclude ingredient IDs, recipes, stock costs and supplier information.

The `[shuug_restaurant_ordering]` WordPress capability opens this same hosted menu and cart. No WordPress-side pricing or inventory database is added. Payment remains at pickup; online card checkout and automatic guest notifications remain separate requirements.

## Credits, reporting and integrations

New checks assign a distinct `id` to every captured line. Money's credit form shows the selected choices so a reviewer can credit one version of a repeated menu item. `credit.issue` accepts `menuId`, `lineId` and `amount` for each affected line. Omitting `lineId` remains supported only when the menu item identifies exactly one line on that check; ambiguous repeated items are rejected. Existing stored checks and credits without line IDs remain supported.

Credits use the original captured net amount and tax. They reduce only the selected line's available credit balance. Net menu reporting subtracts each credit once while combining quantities and sales for the underlying menu item. Actual food cost includes the selected recipe. Menu-level stock/cost estimates describe the base recipe; final option-dependent availability and cost are checked on the order.

Use `restaurant_catalog` to discover the updated `menu.save` and `order.create` contracts over MCP/backend HTTP. Order lines accept an `options` array of choice IDs. The server owns prices, recipe adjustments and line IDs; callers cannot supply their own resolved amounts. Existing plain-menu commands work without an options array. Consultant workspace exports still exclude real menu/order/customer business data.

See [restaurant acceptance](RESTAURANT-ACCEPTANCE.md) for the complete remaining scope and verification evidence.
