"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CategoryProgress } from "@/components/category-progress";
import { ExpenseList } from "@/components/expense-list";
import { SetupChecklist } from "@/components/setup-checklist";
import { useMonth } from "@/components/month-context";
import { Empty, ErrorNote, Loading, Money, PageTitle, SpendBar, StatusNote } from "@/components/ui";
import { useFetch, type ExpenseList as ExpenseListData, type Summary } from "@/lib/client";
import { monthLabel } from "@/lib/dates";
import { formatNaira } from "@/lib/money";

export default function DashboardPage() {
  const { month } = useMonth();
  const summary = useFetch<Summary>(`/reports/summary?month=${month}`);
  const byUser = useFetch<{ users: { userId: string; displayName: string; spent: string; count: number }[] }>(
    `/reports/by-user?month=${month}`,
  );
  const recent = useFetch<ExpenseListData>(`/expenses?month=${month}&pageSize=8`);
  const anyExpenses = useFetch<ExpenseListData>(`/expenses?pageSize=1`);

  if (summary.loading && !summary.data) return <Loading />;
  if (summary.error || !summary.data) return <ErrorNote message={summary.error ?? "Could not load"} />;
  const s = summary.data;

  const rows = s.categories.filter((c) => Number(c.budget) > 0 || Number(c.spent) > 0);
  const pie = rows
    .filter((c) => Number(c.spent) > 0)
    .map((c) => ({ name: c.name, value: Number(c.spent), color: c.color }));

  return (
    <div className="space-y-4">
      <PageTitle title={monthLabel(month)}>
        <div className="flex items-center gap-2">
          <Link
            href="/shopping-list"
            className="btn btn-ghost text-sm min-h-[40px] flex items-center gap-1.5 border border-border touch-manipulation active:scale-95"
          >
            🛒 Shopping list
          </Link>
          <Link
            href="/log"
            className="btn btn-primary text-sm min-h-[40px] flex items-center touch-manipulation active:scale-95"
          >
            ＋ Log expense
          </Link>
        </div>
      </PageTitle>

      <SetupChecklist summary={s} hasExpenses={(anyExpenses.data?.total ?? 0) > 0} />

      {/* Month Totals Summary */}
      <section className="card p-4 sm:p-5" aria-label="Month totals">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs sm:text-sm text-muted">Total spent</div>
            <div className="text-2xl sm:text-3xl font-bold">
              <Money value={s.totals.spent} status={s.totals.status} />
            </div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-muted">Total budget</div>
            <div className="text-2xl sm:text-3xl font-bold">
              <Money value={s.totals.budget} />
            </div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-muted">
              {s.totals.overdrawn ? "Overspent" : "Remaining"}
            </div>
            <div className="text-2xl sm:text-3xl font-bold">
              <Money
                value={s.totals.overdrawn ? Math.abs(Number(s.totals.remaining)) : s.totals.remaining}
                status={s.totals.status}
              />
            </div>
          </div>
        </div>

        <SpendBar percent={s.totals.percent} status={s.totals.status} />
        <div className="mt-2 flex items-center justify-between text-xs sm:text-sm">
          <StatusNote status={s.totals.status} remaining={s.totals.remaining} />
          <span className="text-muted">{Math.round(s.totals.percent)}% of budget used</span>
        </div>
      </section>

      {/* Grid: Donut Chart & Category Budgets */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Where the money went (Donut Chart & Who spent what) */}
        <section className="card" aria-label="Where the money went">
          <h2 className="mb-2 font-semibold">Where the money went</h2>
          {pie.length === 0 ? (
            <Empty>No spending recorded this month.</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                  >
                    {pie.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatNaira(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {byUser.data && byUser.data.users.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <h3 className="mb-1 text-sm font-semibold">Who spent what</h3>
              <ul className="divide-y divide-border/40 text-sm">
                {byUser.data.users.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between py-1.5">
                    <span className="font-medium">
                      {u.displayName}{" "}
                      <span className="text-xs text-muted">
                        ({u.count} {u.count === 1 ? "expense" : "expenses"})
                      </span>
                    </span>
                    <Money value={u.spent} className="font-semibold" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Categories (Budget vs Spent) */}
        <section className="card" aria-label="Categories">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Categories</h2>
            <Link href="/categories" className="text-sm text-brand underline">
              Edit budgets
            </Link>
          </div>
          {s.categories.length === 0 ? (
            <Empty>No categories yet. Add some on the Budgets page.</Empty>
          ) : (
            <CategoryProgress summary={s} />
          )}
        </section>
      </div>

      {/* Recent expenses */}
      <section className="card" aria-label="Recent expenses">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Recent expenses</h2>
          <Link href="/ledger" className="text-sm text-brand underline">
            Full ledger →
          </Link>
        </div>
        {recent.loading && !recent.data ? (
          <Loading />
        ) : (
          <ExpenseList items={recent.data?.items ?? []} emptyText="Nothing logged this month yet." />
        )}
      </section>
    </div>
  );
}
