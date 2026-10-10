"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ErrorNote, Loading, Money, PageTitle } from "@/components/ui";
import { useFetch } from "@/lib/client";
import { monthLabel } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { spendStatus } from "@/lib/status";

type MonthRow = { month: string; spent: string; budgeted: string; count: number };

export default function MonthlyPage() {
  const { data, loading, error } = useFetch<{ months: MonthRow[] }>("/reports/monthly");
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorNote message={error ?? "Could not load"} />;

  const months = data.months;
  const chart = months.map((m) => ({
    label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
      new Date(`${m.month}-01T00:00:00Z`),
    ),
    Spent: Number(m.spent),
    Budget: Number(m.budgeted),
  }));
  const grand = months.reduce((sum, m) => sum + Number(m.spent), 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Monthly spending" />
      {months.length === 0 ? (
        <div className="card">
          <Empty>No spending recorded yet.</Empty>
        </div>
      ) : (
        <>
          <section className="card" aria-label="Chart">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                  <YAxis
                    stroke="var(--muted)"
                    fontSize={12}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    width={44}
                  />
                  <Tooltip formatter={(v) => formatNaira(Number(v))} />
                  <Legend />
                  <Bar dataKey="Budget" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spent" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card overflow-x-auto" aria-label="Table">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <th className="th">Month</th>
                  <th className="th text-right">Budgeted</th>
                  <th className="th text-right">Spent</th>
                  <th className="th text-right">Entries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="td">
                      <Link href={`/history/${m.month}`} className="text-brand underline">
                        {monthLabel(m.month)}
                      </Link>
                    </td>
                    <td className="td text-right">
                      <Money value={m.budgeted} />
                    </td>
                    <td className="td text-right">
                      <Money value={m.spent} status={spendStatus(Number(m.spent), Number(m.budgeted))} />
                    </td>
                    <td className="td text-right">{m.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="td">All time</td>
                  <td className="td" />
                  <td className="td text-right">
                    <Money value={grand} />
                  </td>
                  <td className="td text-right">{months.reduce((n, m) => n + m.count, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
