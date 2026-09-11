import Link from "next/link";

/** 404 — friendly, on-brand, keeps the owner oriented. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-3xl">🧭</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">That link doesn’t lead anywhere. Let’s get you back on track.</p>
      <Link href="/" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Back to Home</Link>
    </div>
  );
}
