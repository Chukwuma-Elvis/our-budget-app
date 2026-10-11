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

        if ("unitPrice" in updates) {
          // Editing unitPrice directly: never overwrite user-entered unitPrice!
          if (next.unitPrice.trim() === "") {
            next.amount = "";
          } else {
            const parsedUnit = parseAmount(next.unitPrice);
            const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
            if (parsedUnit !== null) {
              next.amount = (q * Number(parsedUnit)).toFixed(2);
            }
          }
        } else if ("amount" in updates) {
          // Editing amount directly: never overwrite user-entered amount!
          if (next.amount.trim() === "") {
            next.unitPrice = "";
          } else {
            const parsedTotal = parseAmount(next.amount);
            const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
            if (parsedTotal !== null) {
              next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
            }
          }
        } else if ("quantity" in updates) {
          // Editing quantity: re-derive amount from unit price if present, otherwise unit price from amount
          const q = Number(next.quantity);
          if (q > 0) {
            const parsedUnit = parseAmount(next.unitPrice);
            if (parsedUnit !== null) {
              next.amount = (q * Number(parsedUnit)).toFixed(2);
            } else {
              const parsedTotal = parseAmount(next.amount);
              if (parsedTotal !== null) {
                next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
              }
            }
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
          {/* Top Bar: Shared Date & Live Running Total */}
          <div className="flex flex-col gap-3 rounded-xl bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:p-0 sm:border-b sm:border-border sm:pb-3">
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
            <div className="flex items-center justify-between border-t border-border/50 pt-2 sm:border-0 sm:pt-0 sm:block sm:text-right">
              <span className="text-xs font-medium text-muted">Total to log</span>
              <div className="text-lg font-bold text-brand sm:text-foreground">
                <Money value={totalAmount} />
              </div>
            </div>
          </div>

          {/* Items Section Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {items.length === 1 ? "Expense Item" : `Expense Items (${items.length})`}
              </span>
              {items.length > 1 && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                  Batch
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-ghost min-h-9 h-9 px-3 text-xs font-semibold text-brand hover:bg-brand/10 active:scale-95"
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
                  className={`rounded-xl border border-border bg-card p-3.5 sm:p-4 space-y-3.5 transition ${
                    items.length > 1 ? "shadow-xs" : ""
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-md bg-muted/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-muted">
                        Item #{index + 1}
                      </span>
                      {parsedTotal && Number(parsedTotal) > 0 && (
                        <span className="text-xs font-semibold text-brand">
                          {formatNaira(parsedTotal)}
                        </span>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="btn btn-ghost min-h-8 h-8 px-2.5 text-xs font-medium text-danger hover:bg-danger-soft active:scale-95"
                        title="Remove this item"
                        aria-label={`Remove item ${index + 1}`}
                      >
                        🗑 Remove
                      </button>
                    )}
                  </div>

                  <Field label="What did you buy?" error={fields[`items.${index}.itemName`]}>
                    <input
                      className="input"
                      value={item.itemName}
                      onChange={(e) => updateItem(item.id, { itemName: e.target.value })}
                      placeholder="e.g. Bag of rice"
                      autoFocus={index === 0}
                      enterKeyHint="next"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <Field label="Quantity">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        step="any"
                        inputMode="numeric"
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
                      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                        <span>ℹ</span>
                        <span>Calculation: {calcBreakdown}</span>
                      </div>
                    )}
                  </Field>

                  <Field label="Category" error={fields[`items.${index}.categoryId`]}>
                    <select
                      className="input cursor-pointer"
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
                      enterKeyHint="done"
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
            className="btn w-full min-h-12 border-dashed border-2 border-border/80 hover:border-brand hover:bg-brand/5 active:scale-[0.98] flex items-center justify-center gap-2 py-3 text-sm font-semibold text-brand transition-all rounded-xl"
          >
            <span className="text-base leading-none">＋</span>
            <span>Add another expense item</span>
          </button>

          {cats.length === 0 && (
            <p className="text-sm text-muted">Add a category on the Budgets page first.</p>
          )}

          {/* Budget Impact Alerts */}
          {categoryImpactHints.length > 0 && (
            <div className="space-y-2">
              {categoryImpactHints.map((hint) => (
                <div
                  key={hint.name}
                  className={`rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium border ${
                    hint.over
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : "border-brand/30 bg-ok-soft text-brand"
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
          <div className="space-y-2 pt-2">
            <button
              className="btn btn-primary w-full min-h-12 text-base font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
