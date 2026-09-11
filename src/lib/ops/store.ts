import { persistentState } from "../workspace/state";
/**
 * Operations store — transactional SQLite state. Holds inventory, shipments, sample
 * requests, and inbound supplier invoices, and enforces the connected flow:
 * shipping (an order or an approved sample) DECREMENTS inventory. Self-contained
 * so it doesn't touch the deal-desk Prisma schema.
 *
 * Writes survive restart. Existing development state is preserved during migration.
 */
import { randomUUID } from "node:crypto";
import { applyReceive, applyShip, checkStock } from "./inventory";
import { allocateFefo, applyAllocation, recallTrace, toTraceabilityRows } from "./lots";
import { costPerCaseCents, recipeAllergens } from "./recipe";
import type {
  CcpCheck,
  InventoryItem,
  Lot,
  ProductLabel,
  Recipe,
  SampleRequest,
  Shipment,
  ShipmentLine,
  SupplierInvoice,
  TraceEvent,
  UploadRecord,
} from "./model";
import type { RecallTrace } from "./lots";

interface OpsState {
  inventory: InventoryItem[];
  shipments: Shipment[];
  samples: SampleRequest[];
  invoices: SupplierInvoice[];
  uploads: UploadRecord[];
  lots: Lot[];
  events: TraceEvent[];
  recipes: Recipe[];
  labels: ProductLabel[];
  ccpChecks: CcpCheck[];
}

function seed(): OpsState {
  return {
    inventory: [
      { skuId: "shuug-amba", onHandCases: 42, reorderPointCases: 20, targetDaysCover: 30, mfgCostPerCaseCents: 2400 },
      { skuId: "shuug-zhoug", onHandCases: 14, reorderPointCases: 20, targetDaysCover: 30, mfgCostPerCaseCents: 2400 },
      { skuId: "shuug-harissa", onHandCases: 26, reorderPointCases: 20, targetDaysCover: 30, mfgCostPerCaseCents: 2600 },
    ],
    shipments: [],
    samples: [
      {
        id: "SMP-0001",
        requesterName: "Marcus Lee",
        company: "Whole Foods NE (buyer)",
        email: "marcus.lee@buyer.example",
        lines: [
          { skuId: "shuug-amba", cases: 1 },
          { skuId: "shuug-zhoug", cases: 1 },
        ],
        note: "Category review — wants to taste before a PO.",
        status: "pending",
        createdAt: "2026-09-06T13:00:00.000Z",
        decidedBy: null,
        shipmentId: null,
      },
    ],
    invoices: [
      { id: "SINV-1", vendor: "GlassCo", invoiceNumber: "G-1001", date: "2026-06-10", lines: [{ itemCode: "BTL-12OZ", description: "12oz bottles (case)", unitPriceCents: 480, quantity: 500 }] },
      { id: "SINV-2", vendor: "GlassCo", invoiceNumber: "G-1042", date: "2026-07-14", lines: [{ itemCode: "BTL-12OZ", description: "12oz bottles (case)", unitPriceCents: 495, quantity: 500 }] },
      { id: "SINV-3", vendor: "GlassCo", invoiceNumber: "G-1090", date: "2026-08-12", lines: [{ itemCode: "BTL-12OZ", description: "12oz bottles (case)", unitPriceCents: 470, quantity: 500 }] },
      { id: "SINV-4", vendor: "CoPack Partners", invoiceNumber: "CP-220", date: "2026-08-20", lines: [{ itemCode: "COPACK-RUN", description: "Co-pack run / 1000 units", unitPriceCents: 90000, quantity: 3 }] },
      { id: "SINV-5", vendor: "CoPack Partners", invoiceNumber: "CP-231", date: "2026-09-02", lines: [{ itemCode: "COPACK-RUN", description: "Co-pack run / 1000 units", unitPriceCents: 92000, quantity: 3 }] },
      { id: "SINV-6", vendor: "CoPack Partners", invoiceNumber: "CP-240", date: "2026-09-08", lines: [{ itemCode: "COPACK-RUN", description: "Co-pack run / 1000 units", unitPriceCents: 88000, quantity: 3 }] },
      // Overcharge: bottles billed way above the ~$4.80 median.
      { id: "SINV-7", vendor: "GlassCo", invoiceNumber: "G-1120", date: "2026-09-09", lines: [{ itemCode: "BTL-12OZ", description: "12oz bottles (case)", unitPriceCents: 720, quantity: 500 }] },
    ],
    uploads: [],
    lots: [
      { id: "LOT-A1", skuId: "shuug-amba", lotCode: "AMBA-2606", producedOn: "2026-06-15", expiresOn: "2027-12-15", quantityCases: 30, remainingCases: 18 },
      { id: "LOT-A2", skuId: "shuug-amba", lotCode: "AMBA-2608", producedOn: "2026-08-20", expiresOn: "2028-02-20", quantityCases: 30, remainingCases: 24 },
      { id: "LOT-Z1", skuId: "shuug-zhoug", lotCode: "ZHOUG-2607", producedOn: "2026-07-10", expiresOn: "2028-01-10", quantityCases: 24, remainingCases: 14 },
      { id: "LOT-H1", skuId: "shuug-harissa", lotCode: "HARISSA-2608", producedOn: "2026-08-05", expiresOn: "2028-02-05", quantityCases: 30, remainingCases: 26 },
    ],
    events: [
      { id: "EV-1", type: "transformation", lotCode: "AMBA-2606", skuId: "shuug-amba", itemDescription: "Amba Hot Sauce", quantityCases: 30, eventDate: "2026-06-15", location: "Shuug Kitchen, MA", reference: "PROD-2606", counterparty: "", inputLotCodes: ["MANGO-2605", "BTL12-2606"] },
      { id: "EV-2", type: "transformation", lotCode: "AMBA-2608", skuId: "shuug-amba", itemDescription: "Amba Hot Sauce", quantityCases: 30, eventDate: "2026-08-20", location: "Shuug Kitchen, MA", reference: "PROD-2608", counterparty: "", inputLotCodes: ["MANGO-2607", "BTL12-2608"] },
    ],
    recipes: [
      { skuId: "shuug-amba", batchYieldCases: 30, ingredients: [
        { name: "Mango", quantity: 18, unit: "kg", costCents: 54000, allergen: null },
        { name: "Fenugreek & spices", quantity: 3, unit: "kg", costCents: 12000, allergen: null },
        { name: "Sesame oil", quantity: 1, unit: "L", costCents: 4000, allergen: "Sesame" },
        { name: "12oz bottles", quantity: 360, unit: "each", costCents: 38000, allergen: null },
      ] },
      { skuId: "shuug-zhoug", batchYieldCases: 24, ingredients: [
        { name: "Cilantro & parsley", quantity: 14, unit: "kg", costCents: 42000, allergen: null },
        { name: "Green chili & garlic", quantity: 4, unit: "kg", costCents: 16000, allergen: null },
        { name: "12oz bottles", quantity: 288, unit: "each", costCents: 30400, allergen: null },
      ] },
      { skuId: "shuug-harissa", batchYieldCases: 30, ingredients: [
        { name: "Red chili & roasted pepper", quantity: 18, unit: "kg", costCents: 57000, allergen: null },
        { name: "Caraway & spices", quantity: 3, unit: "kg", costCents: 13000, allergen: null },
        { name: "12oz bottles", quantity: 360, unit: "each", costCents: 38000, allergen: null },
      ] },
    ],
    labels: [
      { skuId: "shuug-amba", ingredientsStatement: "Mango, vinegar, fenugreek, garlic, salt, sesame oil, spices.", allergens: ["Sesame"], netWeight: "12 fl oz (355 mL)", shelfLifeDays: 540 },
      { skuId: "shuug-zhoug", ingredientsStatement: "Cilantro, parsley, green chili, garlic, olive oil, salt, spices.", allergens: [], netWeight: "12 fl oz (355 mL)", shelfLifeDays: 540 },
      { skuId: "shuug-harissa", ingredientsStatement: "Red chili, roasted pepper, garlic, olive oil, caraway, salt, spices.", allergens: [], netWeight: "12 fl oz (355 mL)", shelfLifeDays: 540 },
    ],
    ccpChecks: [
      { id: "CCP-1", ccp: "pH (acidification)", hazard: "C. botulinum", criticalLimit: "pH ≤ 4.0", measured: "3.6", withinLimit: true, correctiveAction: "", checkedBy: "Owner", checkedAt: "2026-08-20T10:00:00.000Z", lotCode: "AMBA-2608" },
      { id: "CCP-2", ccp: "Fill temperature", hazard: "Pathogen survival", criticalLimit: "≥ 185°F", measured: "188°F", withinLimit: true, correctiveAction: "", checkedBy: "Owner", checkedAt: "2026-08-20T10:20:00.000Z", lotCode: "AMBA-2608" },
    ],
  };
}

const legacy = globalThis as unknown as { __opsState?: OpsState };
const durable = persistentState<OpsState>("operations", () => legacy.__opsState ?? (process.env.DEMO_DATA === "true" ? seed() : { inventory: [], shipments: [], samples: [], invoices: [], uploads: [], lots: [], events: [], recipes: [], labels: [], ccpChecks: [] }));

function nextId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function getInventory(): InventoryItem[] {
  const state = durable.read();
  return state.inventory.map((i) => ({ ...i }));
}
export function listShipments(): Shipment[] {
  const state = durable.read();
  return [...state.shipments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => structuredClone(s));
}
export function listSampleRequests(): SampleRequest[] {
  const state = durable.read();
  return [...state.samples].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => structuredClone(s));
}
export function listSupplierInvoices(): SupplierInvoice[] {
  const state = durable.read();
  return state.invoices.map((i) => structuredClone(i));
}

export function listUploads(): UploadRecord[] {
  const state = durable.read();
  return [...state.uploads].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map((u) => ({ ...u }));
}

/** Append parsed invoices from an upload and record the upload for tracking. */
export function addUploadedInvoices(
  filename: string,
  invoices: SupplierInvoice[],
  stats: { rowsRead: number; linesMapped: number; skipped: number },
): UploadRecord {
  return durable.change(state => {
  for (const inv of invoices) {
    // Give uploaded invoices a unique id so re-uploads don't collide.
    state.invoices.push({ ...inv, id: `${inv.id}-${nextId("u")}` });
  }
  const record: UploadRecord = {
    id: nextId("UP"),
    filename,
    rowsRead: stats.rowsRead,
    linesMapped: stats.linesMapped,
    invoicesAdded: invoices.length,
    skipped: stats.skipped,
    uploadedAt: new Date().toISOString(),
  };
  state.uploads.push(record);
  return { ...record };

  });
}

/** Receive produced/purchased stock into inventory. */
export function receive(skuId: string, cases: number): InventoryItem[] {
  return durable.change(state => {
  if (!state.inventory.some((i) => i.skuId === skuId)) {
    throw new Error(`Unknown SKU ${skuId}`);
  }
  state.inventory = applyReceive(skuId, cases, state.inventory);
  return getInventory();

  });
}

/** Has an order already been shipped (idempotency guard)? */
export function orderShipped(orderId: string): boolean {
  const state = durable.read();
  return state.shipments.some((s) => s.kind === "order" && s.refId === orderId);
}

// ---- Traceability / production reads ----------------------------------------

export function listLots(): Lot[] {
  const state = durable.read();
  return state.lots.map((l) => ({ ...l }));
}
export function listTraceEvents(): TraceEvent[] {
  const state = durable.read();
  return state.events.map((e) => structuredClone(e));
}
export function listRecipes(): Recipe[] {
  const state = durable.read();
  return state.recipes.map((r) => structuredClone(r));
}
export function listLabels(): ProductLabel[] {
  const state = durable.read();
  return state.labels.map((l) => structuredClone(l));
}
export function listCcpChecks(): CcpCheck[] {
  const state = durable.read();
  return state.ccpChecks.map((c) => ({ ...c }));
}

/** True cost per case from the recipe/BOM (mfg cost roll-up). */
export function recipeCostPerCaseCents(skuId: string): number | null {
  const state = durable.read();
  const recipe = state.recipes.find((r) => r.skuId === skuId);
  return recipe ? costPerCaseCents(recipe) : null;
}

/** Allergens for a SKU rolled up from its recipe. */
export function skuAllergens(skuId: string): string[] {
  const state = durable.read();
  const recipe = state.recipes.find((r) => r.skuId === skuId);
  return recipe ? recipeAllergens(recipe) : [];
}

/**
 * Run a production batch: create a lot (new TLC), add the cases to inventory,
 * and record the transformation CTE. Returns the new lot.
 */
export function produceRun(skuId: string, batches = 1): Lot {
  return durable.change(state => {
  const recipe = state.recipes.find((r) => r.skuId === skuId);
  if (!recipe) throw new Error(`No recipe for ${skuId}`);
  if (!Number.isInteger(batches) || batches < 1) throw new RangeError("batches must be a positive integer");
  const label = state.labels.find((l) => l.skuId === skuId);
  const shelfDays = label?.shelfLifeDays ?? 365;

  const now = new Date();
  const cases = recipe.batchYieldCases * batches;
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lotCode = `${skuId.replace(/^shuug-/, "").toUpperCase()}-${yymm}-${nextId("").slice(0, 4)}`;
  const expires = new Date(now.getTime() + shelfDays * 86_400_000);

  const lot: Lot = {
    id: nextId("LOT"),
    skuId,
    lotCode,
    producedOn: now.toISOString().slice(0, 10),
    expiresOn: expires.toISOString().slice(0, 10),
    quantityCases: cases,
    remainingCases: cases,
  };
  state.lots.push(lot);
  state.inventory = applyReceive(skuId, cases, state.inventory);
  state.events.push({
    id: nextId("EV"),
    type: "transformation",
    lotCode,
    skuId,
    itemDescription: skuId,
    quantityCases: cases,
    eventDate: now.toISOString(),
    location: "Shuug Kitchen, MA",
    reference: `PROD-${lot.id}`,
    counterparty: "",
    inputLotCodes: recipe.ingredients.map((i) => `${i.name.slice(0, 6).toUpperCase()}-${yymm}`),
  });
  return { ...lot };

  });
}

/** Recall trace for a lot: every event, who it shipped to, what it was made from. */
export function recall(lotCode: string): RecallTrace {
  const state = durable.read();
  return recallTrace(lotCode, state.events);
}

/** The FSMA-204 sortable traceability export rows (feed a 24-hour FDA request). */
export function traceabilityExportRows(): Record<string, string | number>[] {
  const state = durable.read();
  return toTraceabilityRows(state.events);
}

export interface ShipInput {
  kind: "order" | "sample";
  refId: string;
  toCompany: string;
  lines: ShipmentLine[];
  carrier: string;
  shippingCostCents: number;
}

/** Ship (order or sample): decrement inventory + record the shipment. Fail-fast if short. */
export function ship(input: ShipInput): Shipment {
  return durable.change(state => {
  const existing = state.shipments.find(s => s.kind === input.kind && s.refId === input.refId);
  if (existing) {
    if (existing.toCompany !== input.toCompany || JSON.stringify(existing.lines) !== JSON.stringify(input.lines.filter(l => l.cases > 0))) throw new Error("This reference already has a different shipment.");
    return existing;
  }
  if (!input.lines.some(l => l.cases > 0)) throw new Error("Add a positive shipment quantity.");
  state.inventory = applyShip(input.lines, state.inventory);
  const now = new Date().toISOString();
  const shipment: Shipment = {
    id: nextId("SHP"),
    kind: input.kind,
    refId: input.refId,
    toCompany: input.toCompany,
    carrier: input.carrier,
    trackingNumber: null,
    shippingCostCents: input.shippingCostCents,
    lines: input.lines.filter((l) => l.cases > 0),
    createdAt: now,
  };
  state.shipments.push(shipment);

  // Traceability: FEFO-allocate lots and record a shipping CTE per lot so a
  // recall can find which customer got which lot. Best-effort — the aggregate
  // inventory above is the source of truth for fulfillment.
  const skuName = new Map(state.recipes.map((r) => [r.skuId, r.skuId]));
  for (const line of input.lines) {
    if (line.cases <= 0) continue;
    const fefo = allocateFefo(state.lots, line.skuId, line.cases, now);
    state.lots = applyAllocation(state.lots, fefo.allocations);
    for (const alloc of fefo.allocations) {
      state.events.push({
        id: nextId("EV"),
        type: "shipping",
        lotCode: alloc.lotCode,
        skuId: line.skuId,
        itemDescription: skuName.get(line.skuId) ?? line.skuId,
        quantityCases: alloc.cases,
        eventDate: now,
        location: "Shuug Kitchen, MA",
        reference: shipment.id,
        counterparty: input.toCompany,
        inputLotCodes: [],
      });
    }
  }

  return structuredClone(shipment);

  });
}

export interface NewSampleInput {
  requesterName: string;
  company: string;
  email: string;
  phone?: string;
  shippingAddress?: string;
  lines: ShipmentLine[];
  note: string;
}

export function createSampleRequest(input: NewSampleInput): SampleRequest {
  return durable.change(state => {
  const req: SampleRequest = {
    id: nextId("SMP"),
    ...input,
    status: "pending",
    createdAt: new Date().toISOString(),
    decidedBy: null,
    shipmentId: null,
  };
  state.samples.push(req);
  return structuredClone(req);

  });
}

export interface SampleDecision {
  approve: boolean;
  decidedBy: string;
  carrier?: string;
  shippingCostCents?: number;
}

/** Approve (→ ships and decrements inventory) or decline a sample request. */
export function decideSample(id: string, decision: SampleDecision): SampleRequest {
  return durable.change(state => {
  const req = state.samples.find((s) => s.id === id);
  if (!req) throw new Error(`Unknown sample request ${id}`);
  if (req.status !== "pending") throw new Error(`Sample ${id} is already ${req.status}`);

  if (!decision.approve) {
    req.status = "declined";
    req.decidedBy = decision.decidedBy;
    return structuredClone(req);
  }

  // Approve = ship it now (must have stock).
  const stock = checkStock(req.lines, state.inventory);
  if (!stock.ok) {
    const s = stock.shortfalls[0];
    throw new Error(`Can't approve — insufficient stock for ${s.skuId} (need ${s.requested}, have ${s.onHand})`);
  }
  const shipment = ship({
    kind: "sample",
    refId: req.id,
    toCompany: req.company,
    lines: req.lines,
    carrier: decision.carrier?.trim() || "Ground",
    shippingCostCents: decision.shippingCostCents ?? 0,
  });
  req.status = "shipped";
  req.decidedBy = decision.decidedBy;
  req.shipmentId = shipment.id;
  return structuredClone(req);

  });
}
