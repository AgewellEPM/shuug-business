import { escapeHtml } from "../auth/forms";
import { CUSTOMER_PATH } from "./accounts";
import type { ClientTaxDocument, TaxDocumentStatus } from "./tax-documents";
const e = (value: unknown) => escapeHtml(String(value ?? ""));
export const taxDocumentStatusLabel = (status: TaxDocumentStatus) => ({ received: "Received · awaiting staff review", reviewed: "Staff reviewed", replacement_requested: "Replacement requested" })[status];
export function taxDocumentUploadHtml(requestId: string, documents: ClientTaxDocument[], title: string) {
  return `<div class="tax-document-upload"><h5>Send this requested document</h5><p>PDF, JPEG or PNG · up to 10 MB per file. Your file stays in your private client workspace.</p>
    <form method="post" action="${CUSTOMER_PATH}/documents" enctype="multipart/form-data"><input type="hidden" name="requestId" value="${e(requestId)}"><label>Document for ${e(title)}<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required></label><button>Send document securely</button></form>
    ${documents.length ? `<ul class="submitted-documents">${documents.map(file => `<li><a href="${CUSTOMER_PATH}/documents/${e(file.id)}">${e(file.name)}</a> · ${(file.size / 1024).toFixed(1)} KB <span class="status">${e(taxDocumentStatusLabel(file.status))}</span><small>Submitted ${e(file.createdAt.slice(0, 10))}${file.reviewedAt ? ` · Review updated ${e(file.reviewedAt.slice(0, 10))}` : ""}</small></li>`).join("")}</ul>` : "<p>No files submitted for this request yet.</p>"}
    <p><small>Received means the file reached your workspace. Your preparer still needs to check it. Document submission does not file a return.</small></p></div>`;
}
