/**
 * Pure QuickBooks Online payload builders. Turns a normalized order (+ resolved
 * QBO customer ref + item map) into a QBO Invoice create body, and a normalized
 * customer into a QBO Customer create body. Cents → decimal dollars only at this
 * boundary. No network here — fully unit-testable.
 */
import type { IncomingCustomer, IncomingOrder } from "./types";

/** cents -> a 2-dp number QBO accepts (e.g. 7200 -> 72). */
export function centsToAmount(cents: number): number {
  if (!Number.isInteger(cents)) throw new RangeError(`centsToAmount: not integer cents: ${cents}`);
  return Math.round(cents) / 100;
}

export interface QboInvoiceLine {
  Amount: number;
  DetailType: "SalesItemLineDetail";
  Description: string;
  SalesItemLineDetail: {
    ItemRef?: { value: string };
    Qty: number;
    UnitPrice: number;
  };
}

export interface QboInvoicePayload {
  CustomerRef: { value: string };
  DocNumber?: string;
  PrivateNote?: string;
  Line: QboInvoiceLine[];
}

export interface QboCustomerPayload {
  DisplayName: string;
  CompanyName: string;
  PrimaryEmailAddr?: { Address: string };
  BillAddr?: { Line1: string };
}

/**
 * Build a QBO Invoice from a normalized order.
 * @param qboCustomerId  the QBO Customer.Id this invoice bills to.
 * @param itemRefBySku   map of source SKU -> QBO Item.Id (omit to leave ItemRef unset).
 */
export function buildQboInvoice(
  order: IncomingOrder,
  qboCustomerId: string,
  itemRefBySku: Record<string, string> = {},
): QboInvoicePayload {
  const Line: QboInvoiceLine[] = order.lines.map((l) => {
    const itemRef = l.sku ? itemRefBySku[l.sku] : undefined;
    return {
      Amount: centsToAmount(l.unitPriceCents * l.quantity),
      DetailType: "SalesItemLineDetail",
      Description: l.title,
      SalesItemLineDetail: {
        ...(itemRef ? { ItemRef: { value: itemRef } } : {}),
        Qty: l.quantity,
        UnitPrice: centsToAmount(l.unitPriceCents),
      },
    };
  });

  return {
    CustomerRef: { value: qboCustomerId },
    DocNumber: order.name.replace(/^#/, "").slice(0, 21) || undefined,
    PrivateNote: order.poNumber ? `PO ${order.poNumber}` : `Shopify ${order.name}`,
    Line,
  };
}

export function buildQboCustomer(customer: IncomingCustomer): QboCustomerPayload {
  return {
    DisplayName: customer.company,
    CompanyName: customer.company,
    ...(customer.buyerEmail ? { PrimaryEmailAddr: { Address: customer.buyerEmail } } : {}),
    ...(customer.billingAddress ? { BillAddr: { Line1: customer.billingAddress } } : {}),
  };
}
