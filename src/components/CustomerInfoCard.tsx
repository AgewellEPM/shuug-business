/**
 * CustomerInfoCard — profile-at-a-glance: contact, website, billing/shipping,
 * QuickBooks mapping, PO requirement. Shown alongside the order builder so you
 * always know who you're ordering for. Presentational.
 */
import { CHANNEL_LABELS, type Customer } from "@/lib/data/model";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

export function CustomerInfoCard({ customer }: { customer: Customer }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Customer
      </h3>
      <dl className="divide-y divide-slate-100">
        <Field label="Company" value={customer.company} />
        <Field label="Channel" value={CHANNEL_LABELS[customer.channel]} />
        <Field label="Account owner" value={customer.accountOwner} />
        {customer.region && <Field label="Region" value={customer.region} />}
        <Field label="Buyer" value={`${customer.buyerName} · ${customer.buyerEmail}`} />
        {customer.phone && <Field label="Phone" value={<a className="text-emerald-700 hover:underline" href={`tel:${customer.phone.replace(/[^+0-9]/g,"")}`}>{customer.phone}</a>} />}
        {customer.website && (
          <Field
            label="Website"
            value={
              <a
                href={customer.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 hover:underline"
              >
                {customer.website}
              </a>
            }
          />
        )}
        <Field label="Billing" value={customer.billingAddress} />
        <Field label="Shipping" value={customer.shippingAddress} />
        <Field
          label="QuickBooks"
          value={customer.quickbooksCustomerId ? `Mapped · ${customer.quickbooksCustomerId}` : "Not mapped"}
        />
        <Field label="PO required" value={customer.requiresPO ? "Yes" : "No"} />
      </dl>
    </div>
  );
}
