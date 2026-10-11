"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMonth } from "@/components/month-context";
import { Empty, ErrorNote, Loading, Money, PageTitle, SpendBar, StatusNote } from "@/components/ui";
import { ApiError, api, useFetch, type Summary } from "@/lib/client";
import { addMonths, monthLabel } from "@/lib/dates";
import { parseAmount } from "@/lib/money";

type Row = Summary["categories"][number];

function BudgetRow({
  row,
  month,
  onChanged,
  onError,
}: {
  row: Row;
  month: string;
  onChanged: () => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [value, setValue] = useState(Number(row.budget) === 0 ? "" : row.budget);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(Number(row.budget) === 0 ? "" : row.budget);
  }, [row.budget, month]);

  async function save() {
    const parsed = parseAmount(value || "0");
    if (parsed === null) {
      onError(`"${value}" is not a valid amount for ${row.name}`);
      return;
    }
    if (parsed === row.budget) return;
    setSaving(true);
    onError(null);
    try {
      if (Number(parsed) <= 0) {
        await api(`/budgets/${row.categoryId}/${month}`, { method: "DELETE" });
      } else {
        await api(`/budgets/${row.categoryId}/${month}`, { method: "PUT", body: { amount: parsed } });
      }
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save budget");
    } finally {
      setSaving(false);
    }
  }

  async function clearFromMonth() {
    onError(null);
    setSaving(true);
    try {
      await api(`/budgets/${row.categoryId}/${month}`, { method: "DELETE" });
      setValue("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove budget for this month");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Remove "${row.name}" completely? It will be removed from all months and will not add to any budget. Past expenses remain in history.`,
      )
    )
      return;
    onError(null);
    try {
      await api(`/categories/${row.categoryId}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove category");
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <span aria-hidden className="size-3 rounded-full" style={{ background: row.color }} />
          {row.name}
        </span>
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">Budget for {row.name}</span>
            <span aria-hidden className="text-muted">
              ₦
            </span>
            <input
              className="input !w-32 text-right"
              inputMode="decimal"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
              disabled={saving}
            />
          </label>
          {Number(row.budget) > 0 && (
            <button
              className="btn btn-ghost !px-2 text-xs"
              onClick={clearFromMonth}
              title={`Remove ${row.name} from this month's budget`}
            >
              Clear month
            </button>
          )}
          <button
            className="btn btn-ghost !px-2 text-xs text-danger"
            onClick={remove}
            title={`Delete ${row.name} completely`}
            aria-label={`Delete ${row.name}`}
          >
            Delete
          </button>
        </div>
      </div>
      <div className="mt-2">
        <SpendBar percent={row.percent} status={row.status} />
        <div className="mt-1 flex justify-between gap-2">
          <span className="text-sm text-muted">
            Spent <Money value={row.spent} status={row.status} />
          </span>
          <StatusNote status={row.status} remaining={row.remaining} />
        </div>
      </div>
    </li>
  );
}

export default function CategoriesPage() {
  const { month, setMonth, currentMonth, nextMonth, isFuture } = useMonth();
  const summary = useFetch<Summary>(`/reports/summary?month=${month}`);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFieldError(null);
    setError(null);
    try {
      await api("/categories", { body: { name } });
      setName("");
      await summary.reload();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.name) setFieldError(err.fields.name);
      else setError(err instanceof Error ? err.message : "Could not add category");
    } finally {
      setBusy(false);
    }
  }

  async function addStarter() {
    setError(null);
    try {
      const r = await api<{ created: number }>("/categories/starter", { method: "POST", body: {} });
      setInfo(`Added ${r.created} suggested categories.`);
      await summary.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add categories");
    }
  }

  async function copyPrevious() {
    const from = addMonths(month, -1);
    setError(null);
    setInfo(null);
    try {
      const r = await api<{ copied: number; skipped: number }>("/budgets/copy", { body: { from, to: month } });
      setInfo(
        r.copied > 0
          ? `Copied ${r.copied} budget${r.copied === 1 ? "" : "s"} from ${monthLabel(from)}${
              r.skipped ? ` (${r.skipped} already set, left unchanged)` : ""
            }.`
          : `Nothing to copy: every category already has a budget this month.`,
      );
      await summary.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy budgets");
    }
  }

  if (summary.loading && !summary.data) return <Loading />;
  const s = summary.data;
  const active = s?.categories.filter((c) => !c.archived) ?? [];

  return (
    <div className="space-y-4">
      <PageTitle title={`Budgets · ${monthLabel(month)}`}>
        <button className="btn w-full sm:w-auto" onClick={copyPrevious}>
          Copy {monthLabel(addMonths(month, -1))} budgets
        </button>
      </PageTitle>

      {/* Quick Month Switcher for Planning Ahead */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMonth(currentMonth)}
          className={`btn min-h-9 px-3.5 text-xs font-semibold transition ${
            month === currentMonth
              ? "btn-primary shadow-xs"
              : "btn-ghost border border-border text-muted hover:text-fg"
          }`}
        >
          {monthLabel(currentMonth)}
        </button>
        <button
          type="button"
          onClick={() => setMonth(nextMonth)}
          className={`btn min-h-9 px-3.5 text-xs font-semibold transition ${
            month === nextMonth
              ? "btn-primary shadow-xs"
              : "btn-ghost border border-border text-muted hover:text-fg"
          }`}
        >
          {monthLabel(nextMonth)}
        </button>
      </div>

      {isFuture && (
        <div className="rounded-xl border border-brand/30 bg-ok-soft p-3.5 text-xs sm:text-sm text-brand">
          <div className="flex items-center gap-2 font-semibold">
            <span>📅</span>
            <span>Planning ahead for {monthLabel(nextMonth)}</span>
          </div>
          <p className="mt-1 text-brand/90">
            You are setting budgets for next month. You can assign category amounts below, or click{" "}
            <strong>Copy {monthLabel(addMonths(month, -1))} budgets</strong> above to duplicate your current budgets into next month.
          </p>
        </div>
      )}

      <ErrorNote message={error ?? summary.error} />
      {info && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm">
          {info}
        </p>
      )}

      <form onSubmit={addCategory} className="card flex flex-wrap items-start gap-2" noValidate>
        <div className="min-w-48 flex-1">
          <label className="sr-only" htmlFor="new-category">
            New category name
          </label>
          <input
            id="new-category"
            className="input"
            placeholder="New category, e.g. Groceries"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!fieldError}
          />
          {fieldError && <p className="field-error">{fieldError}</p>}
        </div>
        <button className="btn btn-primary" disabled={busy || !name.trim()} type="submit">
          Add category
        </button>
      </form>

      <section className="card">
        {active.length === 0 ? (
          <div className="space-y-3 text-center">
            <Empty>No categories yet.</Empty>
            <button className="btn btn-primary" onClick={addStarter}>
              Add suggested categories
            </button>
            <p className="text-xs text-muted">
              Food &amp; Groceries, Transport, Rent, Utilities, Airtime &amp; Data, Health, Family &amp; Support,
              Savings, Miscellaneous. You can edit or remove any of them.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-1 text-sm text-muted">
              Set what you plan to spend in each category this month. Unspent budget does not carry over, and you can
              spend more than the budget — it will show in red.
            </p>
            <ul className="divide-y divide-border">
              {active.map((c) => (
                <BudgetRow key={c.categoryId} row={c} month={month} onChanged={summary.reload} onError={setError} />
              ))}
            </ul>
            {s && (
              <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span>
                  <Money value={s.totals.spent} status={s.totals.status} /> of <Money value={s.totals.budget} />
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
