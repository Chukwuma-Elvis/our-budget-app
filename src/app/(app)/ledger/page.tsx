"use client";

import { useState, type FormEvent } from "react";
import { ExpenseList } from "@/components/expense-list";
import { useMonth } from "@/components/month-context";
import { Empty, ErrorNote, Field, Loading, Modal, Money, PageTitle } from "@/components/ui";
import {
  ApiError,
  api,
  useFetch,
  type Category,
  type Expense,
  type ExpenseList as ExpenseListData,
  type Me,
} from "@/lib/client";
import { formatDate, monthLabel } from "@/lib/dates";
import { parseAmount } from "@/lib/money";

type AuditEntry = {
  id: string;
  expenseId: string;
  action: "create" | "update" | "delete";
  actor: string;
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  at: string;
};

function EditModal({ expense, onClose, onSaved }: { expense: Expense; onClose: () => void; onSaved: () => void }) {
  const categories = useFetch<{ categories: Category[] }>("/categories");
  const [itemName, setItemName] = useState(expense.itemName);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(expense.amount);
  const [amount, setAmount] = useState(expense.amount);
  const [categoryId, setCategoryId] = useState(expense.category.id);
  const [spentOn, setSpentOn] = useState(expense.spentOn);
  const [note, setNote] = useState(expense.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/expenses/${expense.id}`, {
        method: "PATCH",
        body: { itemName, amount, categoryId, spentOn, note: note || null },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  const options = categories.data?.categories ?? [];
  const includesCurrent = options.some((c) => c.id === expense.category.id);

  return (
    <Modal title="Edit expense" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Item" error={fields.itemName}>
          <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
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
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => onAmountChange(e.target.value)} />
        </Field>
        <Field label="Category" error={fields.categoryId}>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {!includesCurrent && <option value={expense.category.id}>{expense.category.name} (removed)</option>}
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" error={fields.spentOn}>
          <input className="input" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Field>
        <Field label="Note" error={fields.note}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <p className="text-xs text-muted">Changes are recorded in the change history for both of you.</p>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" disabled={busy} type="submit">
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function describe(a: AuditEntry): string {
  const snap = a.after ?? a.before;
  const what = snap ? `${snap.itemName} (₦${Number(snap.amount).toLocaleString("en-NG")})` : "an expense";
  if (a.action === "create") return `${a.actor} added ${what}`;
  if (a.action === "delete") return `${a.actor} deleted ${what}`;
  const changes: string[] = [];
  if (a.before && a.after) {
    for (const key of ["itemName", "amount", "spentOn", "note", "categoryId"] as const) {
      if (a.before[key] !== a.after[key]) changes.push(key === "categoryId" ? "category" : key);
    }
  }
  return `${a.actor} edited ${what}${changes.length ? ` — changed ${changes.join(", ")}` : ""}`;
}

function ChangeHistory() {
  const { data, loading, error } = useFetch<{ entries: AuditEntry[] }>("/audit");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data?.entries.length) return <Empty>No changes recorded yet.</Empty>;
  return (
    <ul className="divide-y divide-border text-sm">
      {data.entries.map((a) => (
        <li key={a.id} className="py-2">
          <span className={a.action === "delete" ? "text-danger" : ""}>{describe(a)}</span>
          <span className="ml-2 text-xs text-muted">{formatDate(a.at.slice(0, 10))}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LedgerPage() {
  const { month } = useMonth();
  const [allMonths, setAllMonths] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const categories = useFetch<{ categories: Category[] }>("/categories?includeArchived=true");
  const me = useFetch<Me>("/auth/me");

  const params = new URLSearchParams();
  if (!allMonths) params.set("month", month);
  if (categoryId) params.set("categoryId", categoryId);
  if (userId) params.set("userId", userId);
  if (q.trim()) params.set("q", q.trim());
  const filterQuery = params.toString();
  params.set("page", String(page));
  const list = useFetch<ExpenseListData>(`/expenses?${params.toString()}`);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  async function remove(e: Expense) {
    if (!window.confirm(`Delete "${e.itemName}" (₦${e.amount})? This is recorded in the change history.`)) return;
    setActionError(null);
    try {
      await api(`/expenses/${e.id}`, { method: "DELETE" });
      await list.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <PageTitle title="Ledger">
        <a className="btn" href={`/api/export/expenses.csv?${filterQuery}`}>
          Download CSV
        </a>
      </PageTitle>

      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="label">Search</span>
          <input
            className="input"
            placeholder="Item name"
            value={q}
            onChange={(e) => resetPage(setQ)(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="label">Category</span>
          <select className="input" value={categoryId} onChange={(e) => resetPage(setCategoryId)(e.target.value)}>
            <option value="">All categories</option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (removed)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Added by</span>
          <select className="input" value={userId} onChange={(e) => resetPage(setUserId)(e.target.value)}>
            <option value="">Everyone</option>
            {me.data?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={allMonths}
            onChange={(e) => resetPage(setAllMonths)(e.target.checked)}
            className="size-4"
          />
          Show all months
        </label>
      </div>

      <section className="card" aria-label="Expenses">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>{allMonths ? "All months" : monthLabel(month)}</span>
          {list.data && (
            <span>
              {list.data.total} {list.data.total === 1 ? "entry" : "entries"} ·{" "}
              <Money value={list.data.totalAmount} className="font-semibold text-fg" />
            </span>
          )}
        </div>
        <ErrorNote message={actionError ?? list.error} />
        {list.loading && !list.data ? (
          <Loading />
        ) : (
          <ExpenseList
            items={list.data?.items ?? []}
            onEdit={setEditing}
            onDelete={remove}
            emptyText="No expenses match these filters."
          />
        )}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ‹ Newer
            </button>
            <span className="text-sm text-muted">
              Page {page} of {totalPages}
            </span>
            <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Older ›
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <button
          className="flex w-full items-center justify-between font-semibold"
          onClick={() => setShowHistory(!showHistory)}
          aria-expanded={showHistory}
        >
          Change history
          <span aria-hidden>{showHistory ? "▾" : "▸"}</span>
        </button>
        {showHistory && (
          <div className="mt-2">
            <ChangeHistory />
          </div>
        )}
      </section>

      {editing && (
        <EditModal
          expense={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
    </div>
  );
}
