/**
 * Money — exact integer-cent arithmetic.
 *
 * Rule: money NEVER touches a JS float in this codebase. Every amount is an
 * integer number of cents. Floats silently lose pennies (0.1 + 0.2 !== 0.3),
 * and a wholesale deal desk that loses pennies loses trust. Parse once at the
 * edge, compute in cents, format once at the edge.
 */

/** A non-negative-or-negative integer count of cents. Enforced at construction. */
export type Cents = number;

const CENTS_RE = /^-?\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a human dollar string ("$44.00", "44", "1,250.5", "-8.30") into cents.
 * Fail-fast: throws on anything it can't represent exactly. No silent rounding.
 */
export function parseDollarsToCents(input: string): Cents {
  if (typeof input !== "string") {
    throw new TypeError(`parseDollarsToCents: expected string, got ${typeof input}`);
  }
  const trimmed = input.trim();
  const m = CENTS_RE.exec(trimmed);
  if (!m) {
    throw new RangeError(`parseDollarsToCents: cannot parse "${input}" as money`);
  }
  const negative = trimmed.startsWith("-");
  const whole = m[1].replace(/,/g, "");
  const frac = (m[2] ?? "").padEnd(2, "0"); // "5" -> "50", "" -> "00"
  const cents = Number(whole) * 100 + Number(frac);
  return negative ? -cents : cents;
}

/** Convert a dollars number (e.g. 44 or 44.5) to cents, rejecting sub-cent precision. */
export function dollarsToCents(dollars: number): Cents {
  if (!Number.isFinite(dollars)) {
    throw new RangeError(`dollarsToCents: not a finite number: ${dollars}`);
  }
  const cents = Math.round(dollars * 100);
  // Reject inputs that had sub-cent precision — the caller is being imprecise.
  if (Math.abs(cents - dollars * 100) > 1e-6) {
    throw new RangeError(`dollarsToCents: ${dollars} has sub-cent precision`);
  }
  return cents;
}

/** Assert a value is a valid integer cent amount. Returns it for chaining. */
export function assertCents(value: unknown, label = "value"): Cents {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
  return value;
}

/** Format cents as "$1,234.56". Handles negatives as "-$8.30". */
export function formatCents(cents: Cents): string {
  assertCents(cents, "formatCents input");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  return `${sign}$${grouped}.${String(remainder).padStart(2, "0")}`;
}
