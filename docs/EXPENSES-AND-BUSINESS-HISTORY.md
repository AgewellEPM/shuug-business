# Expenses, receipt files and business history

Open **Money → Expenses & receipts** (`/expenses`). Upload a JPG, PNG, WebP, HEIC photo or PDF, or use **Take a photo** on a phone. Drag and drop and batches of up to 20 receipts work. Each file is limited to 10 MB by actual streamed bytes. The original filename is display-only; generated checksums and validated extensions determine storage paths.

Uploads create **Needs review** records. Local text recognition suggests merchant, receipt date, currency, total and included tax. Conflicting total lines stay blank. Review the original beside the suggested fields, choose category/channel and report treatment, then **Record expense**. Neither uploading nor OCR counts an expense automatically. Exact copies reopen the existing record; matching merchant/date/amount/currency entries need an explicit separate-purchase choice. Failed saves retain edits, and revision checks prevent overwriting another edit.

Search includes merchant, reference, notes, filename and extracted receipt text. Filter by dates, category and status; export the current view as CSV. Original files and structured JSON records can be downloaded. Each edit, archive and restore retains a dated version with its prior fields. Archiving removes an expense from current totals without deleting the receipt. Files and records are saved under `DEALDESK_DATA_DIR/expenses`, with private directory/file permissions; original receipts are not encrypted. Back up the entire private data volume. Production reads/uploads/actions require the authenticated owner gateway, including receipt downloads. Original files are served with private/no-store caching and MIME protection, with a checksum verified at download.

## Local text reading

This implementation uses existing **Tesseract** with English language data for images and **Poppler** (`pdftotext`, `pdftoppm`) for PDFs. HEIC conversion uses macOS `/usr/bin/sips`. No receipt is sent to an AI or external OCR service. On a server without these executables, originals still save and manual review remains available; the interface explains that text extraction is unavailable. No dependency installer runs at upload time.

PDF text recognition covers the first three pages; downloads retain the entire original PDF. Scanned PDFs render at a bounded size before OCR. Individual commands time out after 15 seconds and a receipt has a 45-second extraction budget. OCR working files are temporary and removed on success or failure. This is text recognition with conservative field matching, not guaranteed receipt interpretation. Blurry photos, unsupported languages, handwritten details and ambiguous currencies require manual entry.

## Calendar and calculations

Open **Calendar** (`/calendar`) or **Calendar & margins** from Reports. Switch Day / Month / Year, pick a date, or navigate previous/next. Clicking a day opens its orders, line items, receipt records and activities. Year cards drill into a month. Product rollups and trend bars follow the selected period and Bulk / Stores / Online filter. CSV exports include cost-coverage flags. `?date=YYYY-MM-DD&view=day` opens a particular day.

The business date uses `America/New_York`, including daylight-saving changes. Order workspace values are USD:

- Product sales = non-cancelled order subtotals, excluding freight.
- Gross profit = product sales − product cost; gross margin = gross profit / sales.
- Contribution = gross profit − recorded operating expenses, including receipt tax as entered. Expense refunds reduce expense amounts.
- Inventory purchases, equipment/assets and transfers stay separate; inventory cost is counted through products sold. Marking an item paid does not create another expense. Unpaid expenses count on their receipt date.
- Shared expenses count in All channels; individual channel views show them separately without inventing an allocation. Other currencies are retained but excluded from USD totals.

Contribution is a management view, not net income, taxable profit or bank cash. Unrecorded expenses, marketplace fees, freight costs and refunds cannot be inferred. Period comparisons use the **full previous period**, clearly labeled; a current incomplete month is not a like-for-like completed-month comparison.

New orders priced with the catalog capture their total landed product cost on each line. Legacy orders use current catalog costs, explicitly labeled estimates. Unknown costs produce unknown profit, rather than zero cost. New local orders and their customer snapshot persist under `local-orders/`; seeded historical orders remain demo data. Business journal entries persist under `business-journal/`. The existing task/note/sample/shipment modules retain their existing storage boundaries; the calendar labels their demo activity. Cards show current status, not a reconstructed audit of every past status change.

For an existing **PostgreSQL** deployment, apply [`scripts/add-order-cost-history.sql`](../scripts/add-order-cost-history.sql) before deploying the updated Prisma client. It adds a nullable `OrderLine.costAtOrderCents` column; it does not backfill invented historical costs. New installations should apply the current Prisma schema. No business database migration is run automatically.

The calendar currently analyzes workspace orders. Separate Amazon shipping snapshots and Amazon attributed advertising sales are not added to revenue totals. Shopify-to-QuickBooks invoice sync does not automatically backfill this order ledger. This prevents double counting while those sources remain separate. Recording an expense here does not post a transaction to QuickBooks.

The deterministic assistant recognizes receipts/expenses/calendar and routes dated sales and margin requests to this calendar.
