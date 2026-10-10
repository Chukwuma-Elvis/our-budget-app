"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api, useFetch } from "@/lib/client";
import { addMonths, currentMonthKey, monthLabel } from "@/lib/dates";
import { MonthProvider, useMonth } from "./month-context";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/log", label: "Log expense", icon: "＋" },
  { href: "/ledger", label: "Ledger", icon: "☰" },
  { href: "/categories", label: "Budgets", icon: "◎" },
  { href: "/spending", label: "By category", icon: "◔" },
  { href: "/monthly", label: "Monthly", icon: "▥" },
  { href: "/recurring", label: "Recurring", icon: "↻" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function MonthPicker() {
  const { month, setMonth } = useMonth();
  const { data } = useFetch<{ months: string[] }>("/reports/months");
  const months = Array.from(new Set([...(data?.months ?? []), month, currentMonthKey()])).sort().reverse();
  const next = addMonths(month, 1);
  const canGoForward = next <= currentMonthKey();

  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-ghost px-2" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
        ‹
      </button>
      <select
        className="input !w-auto !py-1.5 text-sm"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        aria-label="Month"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button
        className="btn btn-ghost px-2"
        disabled={!canGoForward}
        onClick={() => setMonth(next)}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

function Shell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { month, isCurrent } = useMonth();

  async function logout() {
    await api("/auth/logout", { method: "POST", body: {} });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
        <div className="mb-6 text-lg font-bold text-brand">₦ Budget Tracker</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  active ? "bg-brand/15 font-semibold text-brand" : "hover:bg-border/50"
                }`}
              >
                <span aria-hidden className="w-5 text-center">
                  {n.icon}
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur">
          <MonthPicker />
          <div className="flex items-center gap-2">
            {!isCurrent && (
              <span className="hidden rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn sm:inline">
                Viewing {monthLabel(month)}
              </span>
            )}
            <span className="hidden text-sm text-muted sm:inline">{userName}</span>
            <button className="btn btn-ghost text-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-5">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-card md:hidden"
        aria-label="Main"
      >
        {NAV.slice(0, 5)
          .concat(NAV[7])
          .map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-16 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${
                  active ? "font-semibold text-brand" : "text-muted"
                }`}
              >
                <span aria-hidden className="text-base">
                  {n.icon}
                </span>
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}

export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <MonthProvider>
      <Shell userName={userName}>{children}</Shell>
    </MonthProvider>
  );
}
