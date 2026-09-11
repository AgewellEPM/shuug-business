/**
 * Operations domain — inventory, shipping, sample requests, and inbound
 * supplier-invoice auditing. Self-contained (its own in-memory store) so it
 * doesn't touch the deal-desk Prisma schema. Money is integer cents.
 */

export interface InventoryItem {
  skuId: string;
  /** cases physically on hand. */
  onHandCases: number;
  /** reorder trigger — at or below this, flag to produce. */
  reorderPointCases: number;
  /** desired days of cover the reorder plan targets. */
  targetDaysCover: number;
  /** cost to MANUFACTURE one case, cents (distinct from wholesale cost). */
  mfgCostPerCaseCents: number;
}

export interface ShipmentLine {
  skuId: string;
  cases: number;
}

export type ShipmentKind = "order" | "sample";

export interface Shipment {
  id: string;
  kind: ShipmentKind;
  /** the order id or sample-request id this shipment fulfills. */
  refId: string;
  toCompany: string;
  carrier: string;
  trackingNumber: string | null;
  shippingCostCents: number;
  lines: ShipmentLine[];
  createdAt: string; // ISO
}

export type SampleStatus = "pending" | "approved" | "shipped" | "declined";

export interface SampleRequest {
  id: string;
  requesterName: string;
  company: string;
  email: string;
  phone?: string;
  shippingAddress?: string;
  lines: ShipmentLine[];
  note: string;
  status: SampleStatus;
  createdAt: string; // ISO
  decidedBy: string | null;
  shipmentId: string | null;
}

// ---- Inbound supplier / freight invoice audit (Bedrock-style) --------------

export interface InvoiceLineItem {
  /** vendor item / part code used to group price history, e.g. "HYD-4410". */
  itemCode: string;
  description: string;
  unitPriceCents: number;
  quantity: number;
}

export interface SupplierInvoice {
  id: string;
  vendor: string;
  invoiceNumber: string;
  date: string; // ISO date
  lines: InvoiceLineItem[];
}

// ---- Lot / batch traceability (FSMA 204 foundation) ------------------------

/** A production lot/batch of a finished good with a shelf-life window. */
export interface Lot {
  id: string;
  skuId: string;
  /** Traceability Lot Code (TLC) — the key FSMA 204 identifier. */
  lotCode: string;
  producedOn: string; // ISO date
  expiresOn: string; // ISO date (best-by / shelf life)
  quantityCases: number; // originally produced
  remainingCases: number; // still on hand from this lot
}

/**
 * FSMA 204 Critical Tracking Events we capture for a sauce maker: raw-material
 * RECEIVING, TRANSFORMATION (production), and SHIPPING. Each carries the Key
 * Data Elements needed to build the 24-hour FDA traceability export.
 */
export type CteType = "receiving" | "transformation" | "shipping";

export interface TraceEvent {
  id: string;
  type: CteType;
  /** Traceability Lot Code the event applies to. */
  lotCode: string;
  skuId: string | null; // finished-good SKU (null for raw-ingredient receiving)
  itemDescription: string;
  quantityCases: number;
  eventDate: string; // ISO
  location: string; // your facility / ship-from
  reference: string; // PO / order / shipment id
  counterparty: string; // vendor (receiving) or customer (shipping)
  /** for transformation: the input lot codes consumed to make this lot. */
  inputLotCodes: string[];
}

// ---- Recipe / BOM + yield --------------------------------------------------

export interface RecipeIngredient {
  name: string;
  quantity: number; // amount used per batch
  unit: string; // "kg", "L", "each", "case"
  costCents: number; // cost of that quantity per batch
  /** major allergen this ingredient carries, if any (feeds label). */
  allergen: string | null;
}

/** A finished-good recipe / bill of materials. */
export interface Recipe {
  skuId: string;
  /** cases produced per batch at 100% (expected) yield. */
  batchYieldCases: number;
  ingredients: RecipeIngredient[];
}

// ---- Labels & allergens (FDA) ----------------------------------------------

export const MAJOR_ALLERGENS = [
  "Milk",
  "Eggs",
  "Fish",
  "Shellfish",
  "Tree nuts",
  "Peanuts",
  "Wheat",
  "Soybeans",
  "Sesame",
] as const;
export type MajorAllergen = (typeof MAJOR_ALLERGENS)[number];

export interface ProductLabel {
  skuId: string;
  ingredientsStatement: string;
  allergens: string[]; // "Contains: ..."
  netWeight: string; // e.g. "12 fl oz (355 mL)"
  shelfLifeDays: number;
}

// ---- HACCP ------------------------------------------------------------------

export interface CcpCheck {
  id: string;
  ccp: string; // e.g. "Cook temperature", "pH", "Metal detection"
  hazard: string;
  criticalLimit: string; // e.g. ">= 165°F", "pH <= 4.0"
  measured: string;
  withinLimit: boolean;
  correctiveAction: string;
  checkedBy: string;
  checkedAt: string; // ISO
  lotCode: string | null;
}

/** A tracked spreadsheet upload (Excel/CSV) — so uploaded files are auditable. */
export interface UploadRecord {
  id: string;
  filename: string;
  rowsRead: number;
  linesMapped: number;
  invoicesAdded: number;
  skipped: number;
  uploadedAt: string; // ISO
}
