import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";
import { bookSaveInput, bookPublishInput, bookShareInput, validatePricingDefinition, type PricingBook, type PricingDefinition } from "./model";
export const pricingHash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function must(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const documentId = "auto-repair:pricing-library";
export function pricingBooks(db: DatabaseSync): PricingBook[] { const row = db.prepare("SELECT body FROM documents WHERE id=? AND kind='auto-repair-pricing'").get(documentId) as { body: string } | undefined; return row ? JSON.parse(row.body) : []; }
function store(db: DatabaseSync, books: PricingBook[]) { db.prepare("INSERT INTO documents VALUES(?,'auto-repair-pricing',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(documentId, JSON.stringify(books)); }
export function pricingAudit(db: DatabaseSync, book: PricingBook, actor: string, action: string) { db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(book.id, actor, action, new Date().toISOString(), JSON.stringify(book)); }
export function commandReceipt(db: DatabaseSync, id: string, request: string): { id: string } | null {
  const saved = db.prepare("SELECT request,result FROM commands WHERE id=?").get(id) as { request: string; result: string } | undefined;
  if (!saved) return null; must(saved.request === request, "This request ID was used for a different action."); return JSON.parse(saved.result);
}
export function recordCommand(db: DatabaseSync, id: string, request: string, result: { id: string }) { db.prepare("INSERT INTO commands VALUES(?,?,?)").run(id, request, JSON.stringify(result)); }
export function changePricingBook(action: "book.save" | "book.publish" | "book.retire" | "book.share", raw: unknown, actor: { id: string; name: string }) {
  const input = action === "book.save" ? bookSaveInput.parse(raw) : action === "book.share" ? bookShareInput.parse(raw) : bookPublishInput.parse(raw), request = pricingHash({ action, input, actor: actor.id });
  return workspaceDatabase(db => {
    const prior = commandReceipt(db, input.requestId, request); if (prior) return prior;
    const books = pricingBooks(db), old = input.id ? books.find(b => b.id === input.id) : undefined;
    must(!input.id || old && old.revision === input.revision, "These pricing rules changed. Refresh before continuing.");
    let book: PricingBook;
    if (action === "book.save") {
      const p = bookSaveInput.parse(input), definition = validatePricingDefinition(p.definition);
      must(!old || old.status === "draft", "Published pricing terms are preserved. Copy them to a new version before changing them.");
      must(!books.some(b => b.id !== old?.id && b.definition.name.toLowerCase() === definition.name.toLowerCase() && b.definition.version === definition.version), "This pricing name and version already exists. Use a new version number.");
      must(old || books.length < 100, "The pricing library has reached its 100-version limit.");
      must(!p.shareInTemplates || books.filter(b => b.id !== old?.id && b.shareInTemplates && b.status !== "retired").length < 30, "A template can include at most 30 pricing versions.");
      book = { id: old?.id ?? randomUUID(), revision: (old?.revision ?? 0) + 1, status: "draft", shareInTemplates: p.shareInTemplates, definition, createdAt: old?.createdAt ?? new Date().toISOString(), publishedAt: null, publishedBy: null, review: "", imported: old?.imported ?? false };
      store(db, [...books.filter(b => b.id !== book.id), book]);
    } else if (action === "book.share") {
      must(old, "Choose a pricing version."); const p = bookShareInput.parse(input);
      must(!p.shareInTemplates || books.filter(b => b.id !== old.id && b.shareInTemplates && b.status !== "retired").length < 30, "A template can include at most 30 pricing versions.");
      book = old; book.shareInTemplates = p.shareInTemplates; book.revision++; store(db, books);
    } else {
      must(old, "Choose a pricing version."); const p = bookPublishInput.parse(input); book = old;
      if (action === "book.publish") { must(book.status === "draft", "Only draft pricing rules can be published."); validatePricingDefinition(book.definition); book.status = "published"; book.publishedAt = new Date().toISOString(); book.publishedBy = `${actor.name} (${actor.id})`; }
      else { must(book.status === "published", "Only published pricing can be retired."); book.status = "retired"; }
      book.review = p.review; book.revision++; store(db, books);
    }
    pricingAudit(db, book, `${actor.name} (${actor.id})`, action); const result = { id: book.id }; recordCommand(db, input.requestId, request, result); return result;
  }, true);
}
export function exportedPricingDefinitions() { return workspaceDatabase(db => pricingBooks(db).filter(b => b.shareInTemplates && b.status === "published").map(b => b.definition)); }
function importPreview(db: DatabaseSync, raw: unknown[]) {
  must(raw.length <= 30, "Import no more than 30 pricing versions."); const definitions = raw.map(validatePricingDefinition), books = pricingBooks(db), keys = definitions.map(d => `${d.name.toLowerCase()}\u0000${d.version}`);
  must(new Set(keys).size === keys.length, "A template cannot repeat a pricing name and version.");
  for (const d of definitions) { const old = books.find(b => b.definition.name.toLowerCase() === d.name.toLowerCase() && b.definition.version === d.version); must(!old || pricingHash(old.definition) === pricingHash(d), `Existing pricing '${d.name}' version ${d.version} has different rules. Rename or version the imported definition.`); }
  const added = definitions.filter(d => !books.some(b => b.definition.name.toLowerCase() === d.name.toLowerCase() && b.definition.version === d.version));
  must(books.length + added.length <= 100, "This import exceeds the pricing library limit."); return { definitions, added, books };
}
export function previewPricingDefinitions(raw: unknown[] = []) { return workspaceDatabase(db => { const p = importPreview(db, raw); return { newPricingVersions: p.added.length, existingPricingVersions: p.definitions.length - p.added.length }; }); }
export function importPricingDefinitions(raw: PricingDefinition[] = []) {
  return workspaceDatabase(db => {
    const p = importPreview(db, raw);
    for (const definition of p.added) { const b: PricingBook = { id: randomUUID(), revision: 1, definition, shareInTemplates: false, status: "draft", createdAt: new Date().toISOString(), publishedAt: null, publishedBy: null, review: "", imported: true }; p.books.push(b); pricingAudit(db, b, "Business template import", "Imported pricing for local review"); }
    store(db, p.books); return p.added.length;
  }, true);
}
