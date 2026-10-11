"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useFetch, type Summary } from "@/lib/client";
import { formatNaira } from "@/lib/money";
import { Empty, ErrorNote, Loading, Money, SpendBar, StatusNote } from "./ui";

/** Budget vs spent per category for one month, plus per-person totals. Used by Spending and History. */
export function SpendingReport({ month }: { month: string }) {
  const summary = useFetch<Summary>(`/reports/summary?month=${month}`);
  const byUser = useFetch<{ users: { userId: string; displayName: string; spent: string; count: number }[] }>(
    `/reports/by-user?month=${month}`,
  );

  if (summary.loading && !summary.data) return <Loading />;
  if (summary.error || !summary.data) return <ErrorNote message={summary.error ?? "Could not load"} />;
  const s = summary.data;
  const rows = s.categories.filter((c) => Number(c.budget) > 0 || Number(c.spent) > 0);
  const pie = rows.filter((c) => Number(c.spent) > 0).map((c) => ({ name: c.name, value: Number(c.spent), color: c.color }));

  return (
    <div className="space-y-4">
      <section className="card grid gap-4 sm:grid-cols-3" aria-label="Totals">
        <div>
          <div className="text-sm text-muted">Total spent</div>
          <div className="text-2xl font-bold">
            <Money value={s.totals.spent} status={s.totals.status} />
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Total budget</div>
          <div className="text-2xl font-bold">
            <Money value={s.totals.budget} />
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">{s.totals.overdrawn ? "Overspent" : "Remaining"}</div>
          <div className="text-2xl font-bold">
            <Money value={s.totals.overdrawn ? Math.abs(Number(s.totals.remaining)) : s.totals.remaining} status={s.totals.status} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card" aria-label="Where the money went">
          <h2 className="mb-2 font-semibold">Where the money went</h2>
          {pie.length === 0 ? (
            <Empty>No spending recorded this month.</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
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
              <ul className="text-sm">
                {byUser.data.users.map((u) => (
                  <li key={u.userId} className="flex justify-between py-0.5">
                    <span>
                      {u.displayName} <span className="text-muted">({u.count})</span>
                    </span>
                    <Money value={u.spent} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card overflow-x-auto" aria-label="By category">
          <h2 className="mb-2 font-semibold">By category</h2>
          {rows.length === 0 ? (
            <Empty>No categories or spending in this month.</Empty>
          ) : (
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <th className="th">Category</th>
                  <th className="th text-right">Budget</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.categoryId}>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.color }} />
                        {c.name}
                        {c.archived && <span className="text-xs text-muted">(removed)</span>}
                      </div>
                      <div className="mt-1 max-w-40">
                        <SpendBar percent={c.percent} status={c.status} />
                      </div>
                    </td>
                    <td className="td text-right">
                      <Money value={c.budget} />
                    </td>
                    <td className="td text-right">
                      <Money value={c.spent} status={c.status} />
                    </td>
                    <td className="td text-right">
                      <StatusNote status={c.status} remaining={c.remaining} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
