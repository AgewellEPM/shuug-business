"use client";

/**
 * Sidebar — Shopify-admin-style left nav. White rail, green active pill, brand
 * mark up top. usePathname drives the active state.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "▦", match: (p: string) => p === "/" },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "📊",
    match: (p: string) => p === "/analytics",
  },
  {
    href: "/copilot",
    label: "Copilot",
    icon: "✦",
    match: (p: string) => p === "/copilot",
  },
  {
    href: "/ads",
    label: "PPC / ads",
    icon: "◎",
    match: (p: string) => p === "/ads",
  },
  {
    href: "/customers/new",
    label: "Add customer",
    icon: "＋",
    match: (p: string) => p === "/customers/new",
  },
  {
    href: "/settings",
    label: "Integrations",
    icon: "⇄",
    match: (p: string) => p === "/settings",
  },
];

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const onCustomer = pathname.startsWith("/customers/") && pathname !== "/customers/new";

  return (
    <aside className="hidden w-60 flex-none border-r border-slate-200 bg-white sm:block">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
          D
        </span>
        <span className="font-semibold tracking-tight text-slate-900">Deal Desk</span>
      </div>
      <nav className="p-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="w-4 text-center text-slate-400">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {onCustomer && (
          <p className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            Viewing customer
          </p>
        )}
      </nav>
    </aside>
  );
}
