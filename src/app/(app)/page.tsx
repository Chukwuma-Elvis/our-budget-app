"use client";

import Link from "next/link";
import { CategoryProgress } from "@/components/category-progress";
import { ExpenseList } from "@/components/expense-list";
import { SetupChecklist } from "@/components/setup-checklist";
import { useMonth } from "@/components/month-context";
import { Empty, ErrorNote, Loading, Money, PageTitle, SpendBar, StatusNote } from "@/components/ui";
import { useFetch, type ExpenseList as ExpenseListData, type Summary } from "@/lib/client";
import { monthLabel } from "@/lib/dates";

export default function DashboardPage() {
  const { month } = useMonth();
  const summary = useFetch<Summary>(`/reports/summary?month=${month}`);
  const recent = useFetch<ExpenseListData>(`/expenses?month=${month}&pageSize=8`);
  const anyExpenses = useFetch<ExpenseListData>(`/expenses?pageSize=1`);

  if (summary.loading && !summary.data) return <Loading />;
  if (summary.error || !summary.data) return <ErrorNote message={summary.error ?? "Could not load"} />;
  const s = summary.data;

  return (
    <div className="space-y-4">
      <PageTitle title={monthLabel(month)}>
        <div className="flex items-center gap-2">
          <Link href="/shopping-list" className="btn btn-ghost text-sm min-h-[40px] flex items-center gap-1.5 border border-border">
            🛒 Shopping list
          </Link>
          <Link href="/log" className="btn btn-primary min-h-[40px] flex items-center">
            ＋ Log expense
          </Link>
        </div>
      </PageTitle>

      <SetupChecklist summary={s} hasExpenses={(anyExpenses.data?.total ?? 0) > 0} />

      <section className="card" aria-label="Month total">
        <div className="text-sm text-muted">Spent this month</div>
        <div className="text-3xl font-bold">
          <Money value={s.totals.spent} status={s.totals.status} />
        </div>
        <div className="mb-2 text-sm text-muted">
          of <Money value={s.totals.budget} /> budgeted
        </div>
        <SpendBar percent={s.totals.percent} status={s.totals.status} />
        <div className="mt-1">
          <StatusNote status={s.totals.status} remaining={s.totals.remaining} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card" aria-label="Categories">
          <div className="mb-1 flex items-center justify-between">
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

        <section className="card" aria-label="Recent expenses">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">Recent</h2>
            <Link href="/ledger" className="text-sm text-brand underline">
              Full ledger
            </Link>
          </div>
          {recent.loading && !recent.data ? (
            <Loading />
          ) : (
            <ExpenseList items={recent.data?.items ?? []} emptyText="Nothing logged this month yet." />
          )}
        </section>
      </div>
    </div>
  );
}
