"use client";

import Link from "next/link";
import { use } from "react";
import { ExpenseList } from "@/components/expense-list";
import { SpendingReport } from "@/components/spending-report";
import { ErrorNote, Loading, PageTitle } from "@/components/ui";
import { useFetch, type ExpenseList as ExpenseListData } from "@/lib/client";
import { isMonthKey, monthLabel } from "@/lib/dates";

export default function HistoryMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = use(params);
  const valid = isMonthKey(month);
  const list = useFetch<ExpenseListData>(valid ? `/expenses?month=${month}&pageSize=100` : null);

  if (!valid) return <ErrorNote message="That month is not valid." />;

  return (
    <div className="space-y-4">
      <PageTitle title={monthLabel(month)}>
        <Link href="/monthly" className="btn">
          ‹ All months
        </Link>
      </PageTitle>
      <p className="text-sm text-muted">Read-only record of this month. Edit entries from the Ledger.</p>
      <SpendingReport month={month} />
      <section className="card">
        <h2 className="mb-1 font-semibold">Every expense</h2>
        {list.loading && !list.data ? (
          <Loading />
        ) : (
          <ExpenseList items={list.data?.items ?? []} emptyText="No expenses were logged this month." />
        )}
        {list.data && list.data.total > list.data.items.length && (
          <p className="mt-2 text-sm text-muted">
            Showing the latest {list.data.items.length} of {list.data.total}.{" "}
            <Link className="text-brand underline" href="/ledger">
              See all in the Ledger
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
