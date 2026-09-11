"use client";

/**
 * SpreadsheetUpload — drop an Excel/CSV of invoices or transactions; it's parsed
 * and audited in place. Shows recent uploads so files are tracked.
 */
import { useRef, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { UploadRecord } from "@/lib/ops/model";
import type { UploadResult } from "@/app/invoices/actions";

export function SpreadsheetUpload({
  uploads,
  uploadAction,
}: {
  uploads: UploadRecord[];
  uploadAction: (formData: FormData) => Promise<UploadResult>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, message: "Choose a file first." });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setResult(null);
    startTransition(async () => {
      const res = await uploadAction(fd);
      setResult(res);
      if (res.ok && fileRef.current) {
        fileRef.current.value = "";
        setFileName("");
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Upload a spreadsheet</h2>
      <p className="mb-3 text-sm text-slate-500">
        Keep invoices in Excel or CSV? Upload the file — we read it, add the rows, and audit them for
        overcharges. Columns like <em>vendor, invoice, item code, unit price, quantity</em> are matched automatically.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Choose file
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="hidden"
          />
        </label>
        {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          {pending ? "Reading…" : "Upload & audit"}
        </button>
      </div>

      {result && (
        <p className={`mt-3 text-sm font-medium ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>
      )}

      {uploads.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Uploaded files</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">{u.filename}</span>
                <span className="text-slate-400">
                  {u.invoicesAdded} inv · {u.linesMapped} lines{u.skipped ? ` · ${u.skipped} skipped` : ""} · {formatDate(u.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
