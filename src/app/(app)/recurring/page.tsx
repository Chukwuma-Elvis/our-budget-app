"use client";

import { useState, type FormEvent } from "react";
import { Empty, ErrorNote, Field, Loading, Money, PageTitle } from "@/components/ui";
import { ApiError, api, useFetch, type Category } from "@/lib/client";
import { formatDate, todayLagos } from "@/lib/dates";

type Item = {
  id: string;
  itemName: string;
  amount: string;
  frequency: "weekly" | "monthly" | "yearly";
  nextRunOn: string;
  active: boolean;
  category: { name: string; color: string };
  createdBy: string;
};

export default function RecurringPage() {
  const list = useFetch<{ items: Item[] }>("/recurring");
  const categories = useFetch<{ categories: Category[] }>("/categories");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<Item["frequency"]>("monthly");
  const [startsOn, setStartsOn] = useState(todayLagos());
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/recurring", { body: { itemName, amount, categoryId, frequency, startsOn } });
      setItemName("");
      setAmount("");
      await list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Item) {
    setError(null);
    try {
      await api(`/recurring/${item.id}`, { method: "PATCH", body: { active: !item.active } });
      await list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete the recurring item "${item.itemName}"? Expenses already created stay in the ledger.`)) return;
    setError(null);
    try {
      await api(`/recurring/${item.id}`, { method: "DELETE" });
      await list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  if (list.loading && !list.data) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle title="Recurring expenses" />
      <p className="text-sm text-muted">
        Rent, subscriptions and other regular costs are added to the ledger automatically once a day when they fall due,
        credited to whoever set them up.
      </p>
      <ErrorNote message={error ?? list.error} />

      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Item" error={fields.itemName}>
          <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. House rent" />
        </Field>
        <Field label="Amount (₦)" error={fields.amount}>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Category" error={fields.categoryId}>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose…</option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeats">
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Item["frequency"])}>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="yearly">Every year</option>
          </select>
        </Field>
        <Field label="First date" error={fields.startsOn}>
          <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            Add recurring expense
          </button>
        </div>
      </form>

      <section className="card">
        {list.data?.items.length ? (
          <ul className="divide-y divide-border">
            {list.data.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className={i.active ? "" : "opacity-60"}>
                  <div className="font-medium">
                    {i.itemName} · <Money value={i.amount} />
                  </div>
                  <div className="text-xs text-muted">
                    {i.category.name} · {i.frequency} · next {formatDate(i.nextRunOn)} · set up by {i.createdBy}
                    {!i.active && " · paused"}
                  </div>
                </div>
                <div className="flex gap-1 w-full sm:w-auto justify-end">
                  <button className="btn" onClick={() => toggle(i)}>
                    {i.active ? "Pause" : "Resume"}
                  </button>
                  <button className="btn btn-ghost text-danger" onClick={() => remove(i)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No recurring expenses yet.</Empty>
        )}
      </section>
    </div>
  );
}
