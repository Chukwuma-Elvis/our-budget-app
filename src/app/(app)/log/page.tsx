"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ExpenseList } from "@/components/expense-list";
import { ErrorNote, Field, Loading, Money, PageTitle } from "@/components/ui";
import {
  ApiError,
  api,
  useFetch,
  type Category,
  type ExpenseList as ExpenseListData,
  type Summary,
} from "@/lib/client";
import { todayLagos } from "@/lib/dates";
import { formatNaira, parseAmount } from "@/lib/money";

export default function LogExpensePage() {
  const categories = useFetch<{ categories: Category[] }>("/categories");
  const [spentOn, setSpentOn] = useState(todayLagos());
  const [categoryId, setCategoryId] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  function onQuantityChange(val: string) {
    setQuantity(val);
    const q = Number(val);
    if (q > 0) {
      const parsedUnit = parseAmount(unitPrice);
      if (parsedUnit !== null) {
        setAmount((q * Number(parsedUnit)).toFixed(2));
      } else {
        const parsedTotal = parseAmount(amount);
        if (parsedTotal !== null) {
          setUnitPrice((Number(parsedTotal) / q).toFixed(2));
        }
      }
    }
  }

  function onUnitPriceChange(val: string) {
    setUnitPrice(val);
    const parsed = parseAmount(val);
    const q = Number(quantity) > 0 ? Number(quantity) : 1;
    if (parsed !== null) {
      setAmount((q * Number(parsed)).toFixed(2));
    }
  }

  function onAmountChange(val: string) {
    setAmount(val);
    const parsed = parseAmount(val);
    const q = Number(quantity) > 0 ? Number(quantity) : 1;
    if (parsed !== null) {
      setUnitPrice((Number(parsed) / q).toFixed(2));
    }
  }

  const calcBreakdown = useMemo(() => {
    const q = Number(quantity);
    const parsedUnit = parseAmount(unitPrice);
    const parsedTotal = parseAmount(amount);
    if (q > 1 && parsedUnit !== null && parsedTotal !== null) {
      return `${q} items × ${formatNaira(parsedUnit)} = ${formatNaira(parsedTotal)}`;
    }
    return null;
  }, [quantity, unitPrice, amount]);

  const entryMonth = spentOn.slice(0, 7);
  const summary = useFetch<Summary>(`/reports/summary?month=${entryMonth}`);
  const recent = useFetch<ExpenseListData>(`/expenses?pageSize=10`);

  const row = summary.data?.categories.find((c) => c.categoryId === categoryId);
  const typed = parseAmount(amount);

  const hint = useMemo(() => {
    if (!row) return null;
    const after = Number(row.remaining) - (typed ? Number(typed) : 0);
    return { after, over: after < 0, budget: Number(row.budget) };
  }, [row, typed]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSaved(null);
    try {
      const q = Number(quantity);
      const parsedUnit = parseAmount(unitPrice);
      const qtySuffix = q > 1 && parsedUnit ? `${q} @ ${formatNaira(parsedUnit)} each` : null;
      const finalNote = note.trim()
        ? qtySuffix ? `${note.trim()} (${qtySuffix})` : note.trim()
        : qtySuffix || undefined;

      await api("/expenses", { body: { itemName, categoryId, amount, spentOn, note: finalNote } });
      setSaved(`Logged ${itemName} (${formatNaira(typed ?? 0)})${qtySuffix ? ` · ${qtySuffix}` : ""}`);
      setItemName("");
      setQuantity("1");
      setUnitPrice("");
      setAmount("");
      setNote("");
      await Promise.all([summary.reload(), recent.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  if (categories.loading && !categories.data) return <Loading />;
  const cats = categories.data?.categories ?? [];

  return (
    <div className="space-y-4">
      <PageTitle title="Log an expense" />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="card space-y-3" noValidate>
          <Field label="What did you buy?" error={fields.itemName}>
            <input
              className="input"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Bag of rice"
              aria-invalid={!!fields.itemName}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity / Number bought">
              <input
                className="input"
                type="number"
                min="1"
                step="any"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="1"
              />
            </Field>
            <Field label="Unit price (₦)">
              <input
                className="input"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => onUnitPriceChange(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Total price (₦)" error={fields.amount}>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
              aria-invalid={!!fields.amount}
            />
            {calcBreakdown && (
              <p className="mt-1 text-xs font-medium text-brand">
                Calculation: {calcBreakdown}
              </p>
            )}
          </Field>
          <Field label="Category" error={fields.categoryId}>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={!!fields.categoryId}
            >
              <option value="">Choose a category…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          {cats.length === 0 && (
            <p className="text-sm text-muted">Add a category on the Budgets page first.</p>
          )}

          {hint && row && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${hint.over ? "bg-danger-soft text-danger" : "bg-ok-soft"}`}
              role="status"
            >
              {hint.over ? (
                <>
                  ⚠ This puts <strong>{row.name}</strong> <strong>over budget by {formatNaira(Math.abs(hint.after))}</strong>.
                  You can still save it.
                </>
              ) : (
                <>
                  <strong>{formatNaira(hint.after)}</strong> left in {row.name} after this
                  {hint.budget === 0 && " (no budget set)"}.
                </>
              )}
            </div>
          )}

          <Field label="Date" error={fields.spentOn}>
            <input
              className="input"
              type="date"
              value={spentOn}
              max={todayLagos()}
              onChange={(e) => setSpentOn(e.target.value)}
              aria-invalid={!!fields.spentOn}
            />
          </Field>
          <Field label="Note (optional)" error={fields.note}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <ErrorNote message={error} />
          {saved && (
            <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm">
              ✔ {saved}
            </p>
          )}
          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save expense"}
          </button>
        </form>

        <section className="card" aria-label="Recently logged">
          <h2 className="mb-1 font-semibold">Recently logged</h2>
          {row && (
            <p className="mb-2 text-sm text-muted">
              {row.name}: <Money value={row.spent} status={row.status} /> spent of <Money value={row.budget} />
            </p>
          )}
          {recent.loading && !recent.data ? <Loading /> : <ExpenseList items={recent.data?.items ?? []} />}
        </section>
      </div>
    </div>
  );
}
