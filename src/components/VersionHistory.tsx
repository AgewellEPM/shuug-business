/**
 * VersionHistory — the audit trail. Every saved agreement leaves a dated,
 * attributed snapshot so "why are we selling this store sauce for $38?" always
 * has an answer. Presentational; newest first.
 */
import { formatDate } from "@/lib/format";
import type { AgreementVersion } from "@/lib/data/model";

export function VersionHistory({ versions }: { versions: AgreementVersion[] }) {
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Agreement history
      </h3>
      <ol className="space-y-3">
        {ordered.map((v) => (
          <li key={v.version} className="flex gap-3 text-sm">
            <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 tabular-nums">
              {v.version}
            </span>
            <div>
              <p className="font-medium text-slate-800">{v.note}</p>
              <p className="text-slate-500">
                {formatDate(v.createdAt)} · {v.changedBy}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
