/** URL slug helpers — a customer's slug is its page URL (/customers/<slug>). */

/** "Joe's Market" -> "joes-market". Empty/garbage input -> "customer". */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’`]/g, "") // drop apostrophes so "Joe's" -> "joes", not "joe-s"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "customer";
}

/** Make a slug unique against a set of taken slugs by appending -2, -3, … */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`uniqueSlug: exhausted candidates for ${base}`);
}
