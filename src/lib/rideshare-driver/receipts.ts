import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { dataDirectory } from "../connections/vault";
import { workspaceDatabase } from "../workspace/database";
import { driverAccount } from "./policy";
import { driverId, DriverError } from "./model";
import { initDriver } from "./store";

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
type Receipt = { id: string; accountId: string; mime: string; size: number; digest: string; createdAt: string };
const directory = (accountId: string) => path.join(dataDirectory(), "driver-receipts", driverId.parse(accountId));
const filename = (accountId: string, id: string) => path.join(directory(accountId), driverId.parse(id));
function mimeFor(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  throw new DriverError(415, "Use a JPEG, PNG or PDF receipt.");
}
export function saveDriverReceipt(token: string | undefined, rawId: string, bytes: Buffer) {
  const id = driverId.parse(rawId);
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES) throw new DriverError(413, "Receipts must be between 1 byte and 5 MB.");
  const mime = mimeFor(bytes), digest = createHash("sha256").update(bytes).digest("hex");
  let owned: string | undefined;
  try {
    return workspaceDatabase(db => {
      const account = driverAccount(db, token); initDriver(db);
      const prior = db.prepare("SELECT * FROM driver_receipts WHERE accountId=? AND id=?").get(account.id, id) as Receipt | undefined;
      if (prior) { if (prior.digest !== digest) throw new DriverError(409, "This receipt ID already contains a different file."); return { id, mime: prior.mime, size: prior.size }; }
      const usage = db.prepare("SELECT coalesce(sum(size),0) AS bytes FROM driver_receipts WHERE accountId=?").get(account.id) as { bytes: number };
      if (usage.bytes + bytes.length > 512 * 1024 * 1024) throw new DriverError(413, "Your receipt storage needs a capacity review. Keep the phone copy and contact the firm.");
      mkdirSync(directory(account.id), { recursive: true, mode: 0o700 });
      const target = filename(account.id, id), temporary = path.join(directory(account.id), `upload-${randomUUID()}`);
      // The write transaction serializes this account's duplicate IDs. Atomic
      // rename also lets a retry repair an orphan after an interrupted DB commit.
      try { writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" }); renameSync(temporary, target); owned = target; }
      finally { rmSync(temporary, { force: true }); }
      db.prepare("INSERT INTO driver_receipts VALUES(?,?,?,?,?,?)").run(account.id, id, mime, bytes.length, digest, new Date().toISOString());
      return { id, mime, size: bytes.length };
    }, true);
  } catch (error) { if (owned) rmSync(owned, { force: true }); throw error; }
}
function receiptBytes(receipt: Receipt | undefined) {
  if (!receipt) throw new DriverError(404, "Receipt unavailable.");
  let bytes: Buffer;
  try { bytes = readFileSync(filename(receipt.accountId, receipt.id)); } catch { throw new DriverError(404, "Receipt unavailable. The phone copy may need to be synced again."); }
  if (bytes.length !== receipt.size || createHash("sha256").update(bytes).digest("hex") !== receipt.digest) throw new DriverError(500, "Receipt integrity needs review.");
  return { ...receipt, bytes };
}
export function driverReceipt(token: string | undefined, rawId: string) {
  const id = driverId.parse(rawId);
  return workspaceDatabase(db => { const account = driverAccount(db, token); initDriver(db); return receiptBytes(db.prepare("SELECT * FROM driver_receipts WHERE accountId=? AND id=?").get(account.id, id) as Receipt | undefined); });
}
/** Call after authenticated staff Money access and module visibility checks. */
export function staffDriverReceipt(rawAccount: string, rawId: string) {
  const account = driverId.parse(rawAccount), id = driverId.parse(rawId);
  return workspaceDatabase(db => {
    initDriver(db);
    const linked = db.prepare("SELECT 1 FROM driver_records WHERE accountId=? AND json_extract(body,'$.kind')='expense' AND json_extract(body,'$.deleted')=0 AND json_extract(body,'$.body.receiptId')=?").get(account, id);
    if (!linked) throw new DriverError(404, "Receipt unavailable.");
    return receiptBytes(db.prepare("SELECT * FROM driver_receipts WHERE accountId=? AND id=?").get(account, id) as Receipt | undefined);
  });
}
export function receiptResponse(receipt: ReturnType<typeof driverReceipt>) {
  const extension = receipt.mime === "image/jpeg" ? "jpg" : receipt.mime === "image/png" ? "png" : "pdf";
  return new Response(new Uint8Array(receipt.bytes), { headers: { "Content-Type": receipt.mime, "Content-Length": String(receipt.bytes.length), "Content-Disposition": `attachment; filename="receipt-${receipt.id}.${extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
