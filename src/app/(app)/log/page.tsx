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
import { ReceiptScannerModal } from "@/components/receipt-scanner-modal";

type LogItem = {
  id: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  categoryId: string;
  note: string;
};

export default function LogExpensePage() {
  const categories = useFetch<{ categories: Category[] }>("/categories");
  const [showScanner, setShowScanner] = useState(false);
  const [spentOn, setSpentOn] = useState(todayLagos());
  const [items, setItems] = useState<LogItem[]>([
    {
      id: "item_init",
      itemName: "",
      quantity: "1",
      unitPrice: "",
      amount: "",
      categoryId: "",
      note: "",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const cats = categories.data?.categories ?? [];

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemName: "",
        quantity: "1",
        unitPrice: "",
        amount: "",
        categoryId: prev[prev.length - 1]?.categoryId || "",
        note: "",
      },
    ]);
  }

  function removeItem(id: string) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateItem(id: string, updates: Partial<LogItem>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...updates };

        if ("quantity" in updates || "unitPrice" in updates) {
          const q = Number(next.quantity);
          const parsedUnit = parseAmount(next.unitPrice);
          if (q > 0 && parsedUnit !== null) {
            next.amount = (q * Number(parsedUnit)).toFixed(2);
          } else if (q > 0) {
            const parsedTotal = parseAmount(next.amount);
            if (parsedTotal !== null) {
              next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
            }
          }
        } else if ("amount" in updates) {
          const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
          const parsedTotal = parseAmount(next.amount);
          if (parsedTotal !== null) {
            next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
          }
        }

        return next;
      }),
    );
  }

  // Calculate total across all items
  const totalAmount = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const parsed = parseAmount(it.amount);
      if (parsed) sum += Number(parsed);
    }
    return sum.toFixed(2);
  }, [items]);

  // Validation: compulsory fields must be filled for every item
  const allCompulsoryFilled = useMemo(() => {
    if (!spentOn.trim() || items.length === 0) return false;
    return items.every((it) => {
      const hasName = it.itemName.trim().length > 0;
      const hasCat = it.categoryId !== "";
      const parsedAmt = parseAmount(it.amount);
      const hasAmt = parsedAmt !== null && Number(parsedAmt) > 0;
      return hasName && hasCat && hasAmt;
    });
  }, [items, spentOn]);

  const entryMonth = spentOn.slice(0, 7);
  const summary = useFetch<Summary>(`/reports/summary?month=${entryMonth}`);
  const recent = useFetch<ExpenseListData>(`/expenses?pageSize=10`);

  // Calculate budget hints for all affected categories
  const categoryImpactHints = useMemo(() => {
    if (!summary.data) return [];
    const totalsByCat = new Map<string, number>();

    for (const it of items) {
      const parsed = parseAmount(it.amount);
      if (it.categoryId && parsed && Number(parsed) > 0) {
        totalsByCat.set(it.categoryId, (totalsByCat.get(it.categoryId) || 0) + Number(parsed));
      }
    }

    const hints = [];
    for (const [catId, spend] of totalsByCat.entries()) {
      const catRow = summary.data.categories.find((c) => c.categoryId === catId);
      if (catRow) {
        const after = Number(catRow.remaining) - spend;
        hints.push({
          name: catRow.name,
          after,
          over: after < 0,
          budget: Number(catRow.budget),
        });
      }
    }
    return hints;
  }, [summary.data, items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allCompulsoryFilled || busy) return;

    setBusy(true);
    setError(null);
    setFields({});
    setSaved(null);

    try {
      if (items.length === 1) {
        const it = items[0];
        const q = Number(it.quantity);
        const parsedUnit = parseAmount(it.unitPrice);
        const qtySuffix = q > 1 && parsedUnit ? `${q} @ ${formatNaira(parsedUnit)} each` : null;
        const finalNote = it.note.trim()
          ? qtySuffix ? `${it.note.trim()} (${qtySuffix})` : it.note.trim()
          : qtySuffix || undefined;

        await api("/expenses", {
          body: {
            itemName: it.itemName.trim(),
            categoryId: it.categoryId,
            amount: it.amount,
            spentOn,
            note: finalNote,
          },
        });
        setSaved(
          `Logged ${it.itemName.trim()} (${formatNaira(it.amount)})${
            qtySuffix ? ` · ${qtySuffix}` : ""
          }`,
        );
      } else {
        const payload = items.map((it) => {
          const q = Number(it.quantity);
          const parsedUnit = parseAmount(it.unitPrice);
          const qtySuffix = q > 1 && parsedUnit ? `${q} @ ${formatNaira(parsedUnit)} each` : null;
          const finalNote = it.note.trim()
            ? qtySuffix ? `${it.note.trim()} (${qtySuffix})` : it.note.trim()
            : qtySuffix || undefined;

          return {
            itemName: it.itemName.trim(),
            categoryId: it.categoryId,
            amount: it.amount,
            spentOn,
            note: finalNote,
          };
        });

        await api<{ count: number }>("/expenses/batch", { body: { items: payload } });
        setSaved(`Logged ${items.length} expenses (${formatNaira(totalAmount)}) to your ledger`);
      }

      setItems([
        {
          id: `item_${Date.now()}`,
          itemName: "",
          quantity: "1",
          unitPrice: "",
          amount: "",
          categoryId: cats[0]?.id || "",
          note: "",
        },
      ]);
      await Promise.all([summary.reload(), recent.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  if (categories.loading && !categories.data) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle title="Log an expense">
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="btn btn-primary w-full sm:w-auto"
        >
          📷 Scan Receipt with AI
        </button>
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="card space-y-4" noValidate>
          {/* Shared Date Field */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="w-full sm:w-1/2">
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
            </div>
            <div className="hidden sm:block text-right">
              <span className="text-xs text-muted">Total to log</span>
              <div className="text-lg font-bold">
                <Money value={totalAmount} />
              </div>
            </div>
          </div>

          {/* Items Section Header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              {items.length === 1 ? "Expense Item" : `Expense Items (${items.length})`}
            </span>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-ghost h-8 text-xs font-semibold text-brand hover:bg-brand/10"
              title="Add another item before saving"
            >
              ＋ Add item
            </button>
          </div>

          {/* Items List */}
          <div className="space-y-4">
            {items.map((item, index) => {
              const q = Number(item.quantity);
              const parsedUnit = parseAmount(item.unitPrice);
              const parsedTotal = parseAmount(item.amount);
              const calcBreakdown =
                q > 1 && parsedUnit !== null && parsedTotal !== null
                  ? `${q} items × ${formatNaira(parsedUnit)} = ${formatNaira(parsedTotal)}`
                  : null;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border border-border bg-card p-3.5 space-y-3 transition ${
                    items.length > 1 ? "shadow-xs" : ""
                  }`}
                >
                  {items.length > 1 && (
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">
                        Item #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="btn btn-ghost h-7 px-2 text-xs text-danger hover:bg-danger-soft"
                        title="Remove this item"
                      >
                        🗑 Remove
                      </button>
                    </div>
                  )}

                  <Field label="What did you buy?" error={fields[`items.${index}.itemName`]}>
                    <input
                      className="input"
                      value={item.itemName}
                      onChange={(e) => updateItem(item.id, { itemName: e.target.value })}
                      placeholder="e.g. Bag of rice"
                      autoFocus={index === 0}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity / Number bought">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                        placeholder="1"
                      />
                    </Field>
                    <Field label="Unit price (₦)">
                      <input
                        className="input"
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </Field>
                  </div>

                  <Field label="Total price (₦)" error={fields[`items.${index}.amount`]}>
                    <input
                      className="input font-semibold"
                      inputMode="decimal"
                      value={item.amount}
                      onChange={(e) => updateItem(item.id, { amount: e.target.value })}
                      placeholder="0.00"
                    />
                    {calcBreakdown && (
                      <p className="mt-1 text-xs font-medium text-brand">
                        Calculation: {calcBreakdown}
                      </p>
                    )}
                  </Field>

                  <Field label="Category" error={fields[`items.${index}.categoryId`]}>
                    <select
                      className="input"
                      value={item.categoryId}
                      onChange={(e) => updateItem(item.id, { categoryId: e.target.value })}
                    >
                      <option value="">Choose a category…</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Note (optional)">
                    <input
                      className="input"
                      value={item.note}
                      onChange={(e) => updateItem(item.id, { note: e.target.value })}
                      placeholder="Optional note"
                    />
                  </Field>
                </div>
              );
            })}
          </div>

          {/* Plus button to add another item */}
          <button
            type="button"
            onClick={addItem}
            className="btn w-full border-dashed border-2 hover:border-brand hover:bg-brand/5 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-brand transition"
          >
            <span>＋</span>
            <span>Add another expense item</span>
          </button>

          {cats.length === 0 && (
            <p className="text-sm text-muted">Add a category on the Budgets page first.</p>
          )}

          {/* Budget Impact Alerts */}
          {categoryImpactHints.length > 0 && (
            <div className="space-y-1.5">
              {categoryImpactHints.map((hint) => (
                <div
                  key={hint.name}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    hint.over ? "bg-danger-soft text-danger" : "bg-ok-soft text-brand"
                  }`}
                  role="status"
                >
                  {hint.over ? (
                    <>
                      ⚠ This puts <strong>{hint.name}</strong>{" "}
                      <strong>over budget by {formatNaira(Math.abs(hint.after))}</strong>.
                    </>
                  ) : (
                    <>
                      ✔ <strong>{formatNaira(hint.after)}</strong> remaining in{" "}
                      <strong>{hint.name}</strong> after this
                      {hint.budget === 0 && " (no budget set)"}.
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <ErrorNote message={error} />
          {saved && (
            <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm">
              ✔ {saved}
            </p>
          )}

          {/* Submit Button (Greyed out until compulsory fields are filled) */}
          <div className="space-y-1.5 pt-2">
            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={!allCompulsoryFilled || busy}
            >
              {busy
                ? "Saving…"
                : items.length === 1
                ? Number(totalAmount) > 0
                  ? `Save expense (${formatNaira(totalAmount)})`
                  : "Save expense"
                : `Save ${items.length} expenses to ledger (${formatNaira(totalAmount)})`}
            </button>
            {!allCompulsoryFilled && (
              <p className="text-center text-xs text-muted">
                Fill in the item name, category, and total price to enable saving.
              </p>
            )}
          </div>
        </form>

        {/* Recently Logged Section */}
        <section className="card" aria-label="Recently logged">
          <h2 className="mb-1 font-semibold">Recently logged</h2>
          {recent.loading && !recent.data ? (
            <Loading />
          ) : (
            <ExpenseList items={recent.data?.items ?? []} />
          )}
        </section>
      </div>

      <ReceiptScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        categories={cats}
        onSuccess={async (count, merchantName) => {
          setSaved(
            `Logged ${count} ${count === 1 ? "expense" : "expenses"}${
              merchantName ? ` from ${merchantName}` : ""
            } to your ledger`,
          );
          await Promise.all([summary.reload(), recent.reload()]);
        }}
      />
    </div>
  );
}
