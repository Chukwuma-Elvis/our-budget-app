"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Empty, ErrorNote, Loading, Money, PageTitle } from "@/components/ui";
import { api, useFetch, type Category, type ShoppingItem } from "@/lib/client";
import { addMonths, currentMonthKey, monthLabel, todayLagos } from "@/lib/dates";
import { formatNaira, parseAmount, updatePriceFields } from "@/lib/money";

type FilterTab = "all" | "pending" | "purchased";

interface EditableItemState {
  itemName: string;
  categoryId: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  lastEditedPrice?: "unitPrice" | "amount";
  saving?: boolean;
  savedPulse?: boolean;
}

export default function ShoppingListPage() {
  const itemsFetch = useFetch<{ items: ShoppingItem[] }>("/shopping-list");
  const categoriesFetch = useFetch<{ categories: Category[] }>("/categories");

  const [filter, setFilter] = useState<FilterTab>("pending");
  const [importing, setImporting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  // Quick add item state
  const [newName, setNewName] = useState("");
  const [newCatId, setNewCatId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newPriceState, setNewPriceState] = useState<{ lastEditedPrice?: "unitPrice" | "amount" }>({});
  const [addingItem, setAddingItem] = useState(false);

  // Inline item editing state map: id -> EditableItemState
  const [itemEdits, setItemEdits] = useState<Record<string, EditableItemState>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingPurchased, setClearingPurchased] = useState(false);

  const categories = categoriesFetch.data?.categories.filter((c) => !c.archived) ?? [];
  const items = itemsFetch.data?.items ?? [];

  const defaultFoodCatId = useMemo(() => {
    const foodCat = categories.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("food") || n.includes("market") || n.includes("grocer");
    });
    return foodCat?.id ?? categories[0]?.id ?? "";
  }, [categories]);

  // Sync default category for new item
  useEffect(() => {
    if (!newCatId && defaultFoodCatId) {
      setNewCatId(defaultFoodCatId);
    }
  }, [newCatId, defaultFoodCatId]);

  // Sync items from server into local editable state
  useEffect(() => {
    if (itemsFetch.data?.items) {
      setItemEdits((prev) => {
        const next: Record<string, EditableItemState> = { ...prev };
        for (const item of itemsFetch.data!.items) {
          if (!next[item.id] || !next[item.id].saving) {
            next[item.id] = {
              itemName: item.itemName,
              categoryId: item.categoryId,
              quantity: item.quantity,
              unitPrice: item.unitPrice ?? "",
              amount: item.amount,
            };
          }
        }
        return next;
      });
    }
  }, [itemsFetch.data]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Previous month label for import button
  const prevMonth = addMonths(currentMonthKey(), -1);
  const prevMonthText = monthLabel(prevMonth);

  // Summary statistics
  const totalCost = useMemo(() => {
    return items.reduce((acc, i) => acc + Number(i.amount || 0), 0);
  }, [items]);

  const purchasedCost = useMemo(() => {
    return items.filter((i) => i.purchased).reduce((acc, i) => acc + Number(i.amount || 0), 0);
  }, [items]);

  const pendingCost = totalCost - purchasedCost;
  const pendingCount = items.filter((i) => !i.purchased).length;
  const purchasedCount = items.filter((i) => i.purchased).length;

  const filteredItems = useMemo(() => {
    if (filter === "pending") return items.filter((i) => !i.purchased);
    if (filter === "purchased") return items.filter((i) => i.purchased);
    return items;
  }, [items, filter]);

  // Bidirectional price calculation for New Item
  function handleNewPriceChange(update: { quantity?: string; unitPrice?: string; amount?: string }) {
    const current = {
      quantity: update.quantity ?? newQty,
      unitPrice: update.unitPrice ?? newUnitPrice,
      amount: update.amount ?? newAmount,
      lastEditedPrice: newPriceState.lastEditedPrice,
    };
    const next = updatePriceFields(current, update);
    setNewQty(next.quantity);
    setNewUnitPrice(next.unitPrice);
    setNewAmount(next.amount);
    setNewPriceState({ lastEditedPrice: next.lastEditedPrice });
  }

  // Bidirectional price calculation for Existing Item
  function handleItemFieldChange(id: string, update: Partial<EditableItemState>) {
    setItemEdits((prev) => {
      const cur = prev[id] || {
        itemName: "",
        categoryId: defaultFoodCatId,
        quantity: "1",
        unitPrice: "",
        amount: "",
      };

      if ("unitPrice" in update || "amount" in update || "quantity" in update) {
        const priceState = updatePriceFields(
          {
            quantity: update.quantity ?? cur.quantity,
            unitPrice: update.unitPrice ?? cur.unitPrice,
            amount: update.amount ?? cur.amount,
            lastEditedPrice: cur.lastEditedPrice,
          },
          update,
        );
        return {
          ...prev,
          [id]: {
            ...cur,
            ...update,
            quantity: priceState.quantity,
            unitPrice: priceState.unitPrice,
            amount: priceState.amount,
            lastEditedPrice: priceState.lastEditedPrice,
          },
        };
      }

      return {
        ...prev,
        [id]: {
          ...cur,
          ...update,
        },
      };
    });
  }

  // Save changes to an existing item on blur
  async function saveItem(id: string) {
    const edit = itemEdits[id];
    if (!edit || edit.saving) return;

    const parsedAmt = parseAmount(edit.amount);
    if (!parsedAmt || Number(parsedAmt) <= 0 || !edit.itemName.trim()) {
      return;
    }

    setItemEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], saving: true },
    }));

    try {
      await api(`/shopping-list/${id}`, {
        method: "PATCH",
        body: {
          itemName: edit.itemName.trim(),
          categoryId: edit.categoryId,
          quantity: edit.quantity.trim() || "1",
          unitPrice: edit.unitPrice ? parseAmount(edit.unitPrice) : null,
          amount: parsedAmt,
        },
      });

      setItemEdits((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: false, savedPulse: true },
      }));

      setTimeout(() => {
        setItemEdits((prev) => ({
          ...prev,
          [id]: { ...prev[id], savedPulse: false },
        }));
      }, 1500);

      itemsFetch.reload();
    } catch (err) {
      setItemEdits((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: false },
      }));
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save item changes",
      });
    }
  }

  // Add new item
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmt = parseAmount(newAmount);
    if (!newName.trim()) {
      setNotification({ type: "error", text: "Please enter an item name" });
      return;
    }
    if (!parsedAmt || Number(parsedAmt) <= 0) {
      setNotification({ type: "error", text: "Please enter a valid price for the item" });
      return;
    }
    if (!newCatId) {
      setNotification({ type: "error", text: "Please select a category" });
      return;
    }

    setAddingItem(true);
    try {
      await api("/shopping-list", {
        method: "POST",
        body: {
          itemName: newName.trim(),
          categoryId: newCatId,
          quantity: newQty.trim() || "1",
          unitPrice: newUnitPrice ? parseAmount(newUnitPrice) : null,
          amount: parsedAmt,
        },
      });

      setNewName("");
      setNewQty("1");
      setNewUnitPrice("");
      setNewAmount("");
      setNotification({ type: "success", text: `Added "${newName.trim()}" to your shopping list` });
      itemsFetch.reload();
    } catch (err) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add item",
      });
    } finally {
      setAddingItem(false);
    }
  }

  // Check / Uncheck purchase state -> automatically logs to ledger!
  async function handleTogglePurchased(item: ShoppingItem) {
    if (togglingId) return;
    setTogglingId(item.id);

    try {
      const res = await api<{ item: ShoppingItem; action: "purchased" | "unpurchased" }>(
        `/shopping-list/${item.id}/toggle`,
        { method: "POST", body: {} },
      );

      if (res.action === "purchased") {
        setNotification({
          type: "success",
          text: `Purchased! Logged ₦${formatNaira(item.amount)} for "${item.itemName}" to your ledger.`,
        });
      } else {
        setNotification({
          type: "info",
          text: `Marked "${item.itemName}" as unpurchased and removed from ledger.`,
        });
      }
      itemsFetch.reload();
    } catch (err) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update item status",
      });
    } finally {
      setTogglingId(null);
    }
  }

  // Delete item
  async function handleDeleteItem(id: string, name: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await api(`/shopping-list/${id}`, { method: "DELETE" });
      setNotification({ type: "info", text: `Deleted "${name}"` });
      itemsFetch.reload();
    } catch (err) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete item",
      });
    } finally {
      setDeletingId(null);
    }
  }

  // Pull previous month's food / market items
  async function handleImportPreviousMonth() {
    setImporting(true);
    try {
      const res = await api<{ count: number; items: ShoppingItem[]; sourceMonth: string }>(
        "/shopping-list/import",
        {
          method: "POST",
          body: { month: prevMonth },
        },
      );

      if (res.count > 0) {
        setNotification({
          type: "success",
          text: `Imported ${res.count} food item${res.count > 1 ? "s" : ""} from ${monthLabel(res.sourceMonth)}!`,
        });
        setFilter("pending");
      } else {
        setNotification({
          type: "info",
          text: `No new food expenses found to import from ${monthLabel(res.sourceMonth)}.`,
        });
      }
      itemsFetch.reload();
    } catch (err) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to import previous month's items",
      });
    } finally {
      setImporting(false);
    }
  }

  // Clear purchased items
  async function handleClearPurchased() {
    if (purchasedCount === 0 || clearingPurchased) return;
    if (!confirm(`Remove ${purchasedCount} purchased item(s) from your shopping list? (Ledger entries will remain)`)) {
      return;
    }

    setClearingPurchased(true);
    try {
      const res = await api<{ deletedCount: number }>("/shopping-list?purchased=true", { method: "DELETE" });
      setNotification({
        type: "info",
        text: `Cleared ${res.deletedCount} purchased item${res.deletedCount > 1 ? "s" : ""} from your list.`,
      });
      itemsFetch.reload();
    } catch (err) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to clear purchased items",
      });
    } finally {
      setClearingPurchased(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Page Title & Top Actions */}
      <PageTitle title="🛒 Shopping List">
        <button
          type="button"
          onClick={handleImportPreviousMonth}
          disabled={importing}
          className="btn btn-primary min-h-[44px] touch-manipulation transition-transform active:scale-95 flex items-center gap-2 text-sm sm:text-base font-medium shadow-sm"
          title={`Pull all items from ${prevMonthText} Food & Market`}
        >
          {importing ? (
            <>
              <span className="animate-spin text-base">↻</span>
              <span>Importing…</span>
            </>
          ) : (
            <>
              <span className="text-base">📥</span>
              <span>Pull from {prevMonthText} Food</span>
            </>
          )}
        </button>
      </PageTitle>

      {/* Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all shadow-sm ${
            notification.type === "success"
              ? "bg-brand/15 text-brand border border-brand/30"
              : notification.type === "error"
              ? "bg-danger-soft text-danger border border-danger/30"
              : "bg-card text-fg border border-border"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{notification.type === "success" ? "✓" : notification.type === "error" ? "⚠" : "ℹ"}</span>
            <span>{notification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 min-h-[32px] min-w-[32px] flex items-center justify-center p-1"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-3 sm:p-4">
          <div className="text-xs sm:text-sm text-muted">Estimated Total</div>
          <div className="text-lg sm:text-2xl font-bold mt-0.5">
            <Money value={totalCost} />
          </div>
          <div className="text-[11px] sm:text-xs text-muted mt-1">
            {items.length} total item{items.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="card p-3 sm:p-4">
          <div className="text-xs sm:text-sm text-muted">To Buy (Pending)</div>
          <div className="text-lg sm:text-2xl font-bold mt-0.5 text-warn">
            <Money value={pendingCost} />
          </div>
          <div className="text-[11px] sm:text-xs text-muted mt-1">
            {pendingCount} remaining
          </div>
        </div>

        <div className="card col-span-2 p-3 sm:col-span-1 sm:p-4">
          <div className="text-xs sm:text-sm text-muted">Purchased & Logged</div>
          <div className="text-lg sm:text-2xl font-bold mt-0.5 text-brand">
            <Money value={purchasedCost} />
          </div>
          <div className="text-[11px] sm:text-xs text-muted mt-1">
            {purchasedCount} logged to ledger
          </div>
        </div>
      </div>

      {/* Add New Item Form (Any Category) */}
      <section className="card p-4 sm:p-5" aria-label="Add item to shopping list">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-brand">
          <span>＋</span> Add new item to shopping list
        </h2>

        <form onSubmit={handleAddItem} className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            {/* Item Name */}
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-muted mb-1">
                Item name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Basket of Tomatoes, Bread..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input text-base md:text-sm !py-2.5 w-full min-h-[44px]"
                enterKeyHint="next"
              />
            </div>

            {/* Category Dropdown (Allows any category) */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-muted mb-1">
                Category <span className="text-danger">*</span>
              </label>
              <select
                value={newCatId}
                onChange={(e) => setNewCatId(e.target.value)}
                className="input text-base md:text-sm !py-2.5 w-full min-h-[44px] cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Quantity</label>
              <input
                type="text"
                placeholder="1"
                value={newQty}
                onChange={(e) => handleNewPriceChange({ quantity: e.target.value })}
                className="input text-base md:text-sm !py-2.5 w-full min-h-[44px]"
                enterKeyHint="next"
              />
            </div>

            {/* Unit Price (Optional / Auto-calc) */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-muted mb-1">Unit price (₦)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={newUnitPrice}
                onChange={(e) => handleNewPriceChange({ unitPrice: e.target.value })}
                className="input text-base md:text-sm !py-2.5 w-full min-h-[44px]"
                enterKeyHint="next"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
            {/* Total Estimated Price */}
            <div className="w-full sm:max-w-xs">
              <label className="block text-xs font-medium text-muted mb-1">
                Total price (₦) <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Total ₦"
                value={newAmount}
                onChange={(e) => handleNewPriceChange({ amount: e.target.value })}
                className="input text-base md:text-sm !py-2.5 w-full min-h-[44px] font-semibold"
                enterKeyHint="done"
              />
            </div>

            <button
              type="submit"
              disabled={addingItem || !newName.trim() || !newAmount.trim()}
              className="btn btn-primary min-h-[44px] px-6 touch-manipulation transition-transform active:scale-95 font-medium disabled:opacity-50"
            >
              {addingItem ? "Adding…" : "＋ Add item"}
            </button>
          </div>
        </form>
      </section>

      {/* Shopping List Section */}
      <section className="card p-3 sm:p-5" aria-label="Shopping list items">
        {/* Filter Tabs & Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 mb-3">
          <div className="flex items-center gap-1 bg-border/40 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium min-h-[36px] transition-all touch-manipulation ${
                filter === "pending"
                  ? "bg-card text-brand font-semibold shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              To buy ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("purchased")}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium min-h-[36px] transition-all touch-manipulation ${
                filter === "purchased"
                  ? "bg-card text-brand font-semibold shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              Purchased ({purchasedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium min-h-[36px] transition-all touch-manipulation ${
                filter === "all"
                  ? "bg-card text-brand font-semibold shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              All ({items.length})
            </button>
          </div>

          {purchasedCount > 0 && (
            <button
              type="button"
              onClick={handleClearPurchased}
              disabled={clearingPurchased}
              className="btn btn-ghost text-xs sm:text-sm text-danger hover:bg-danger-soft min-h-[38px] px-2.5"
              title="Clean up purchased items from the list"
            >
              {clearingPurchased ? "Clearing…" : "Clear purchased"}
            </button>
          )}
        </div>

        {/* Loading / Error / Empty States */}
        {itemsFetch.loading && items.length === 0 ? (
          <Loading label="Loading shopping list…" />
        ) : itemsFetch.error ? (
          <ErrorNote message={itemsFetch.error} />
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted">
              {filter === "pending"
                ? "No pending items! All items are purchased or your list is empty."
                : filter === "purchased"
                ? "No purchased items yet. Check off items as you buy them to automatically log them into your ledger."
                : "Your shopping list is empty."}
            </p>
            {filter === "pending" && items.length === 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleImportPreviousMonth}
                  disabled={importing}
                  className="btn btn-primary min-h-[44px] text-sm"
                >
                  📥 Pull items from {prevMonthText} Food
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Bulleted Editable List */
          <ul className="space-y-3 divide-y divide-border/40">
            {filteredItems.map((item) => {
              const edit = itemEdits[item.id] || {
                itemName: item.itemName,
                categoryId: item.categoryId,
                quantity: item.quantity,
                unitPrice: item.unitPrice ?? "",
                amount: item.amount,
              };
              const isToggling = togglingId === item.id;
              const isDeleting = deletingId === item.id;

              return (
                <li
                  key={item.id}
                  className={`pt-3 first:pt-0 transition-colors rounded-xl p-2 sm:p-3 ${
                    item.purchased
                      ? "bg-brand/5 border border-brand/20 opacity-80"
                      : "hover:bg-border/20 border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    {/* Checkbox: Tapping automatically logs to ledger! */}
                    <div className="pt-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePurchased(item)}
                        disabled={isToggling}
                        aria-label={item.purchased ? `Mark ${item.itemName} unpurchased` : `Mark ${item.itemName} purchased`}
                        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border-2 transition-all touch-manipulation active:scale-95 ${
                          item.purchased
                            ? "bg-brand border-brand text-bg"
                            : "border-muted/50 hover:border-brand bg-card"
                        }`}
                      >
                        {isToggling ? (
                          <span className="text-xs animate-spin">↻</span>
                        ) : item.purchased ? (
                          <span className="text-base font-bold">✓</span>
                        ) : (
                          <span className="text-xs text-transparent">○</span>
                        )}
                      </button>
                    </div>

                    {/* Bullet indicator styled with Category Color */}
                    <div className="pt-4 shrink-0 flex items-center" aria-hidden="true">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.category.color || "#16a34a" }}
                        title={item.category.name}
                      />
                    </div>

                    {/* Editable Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Row 1: Item Name & Category Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-8">
                          <input
                            type="text"
                            value={edit.itemName}
                            disabled={item.purchased}
                            onChange={(e) => handleItemFieldChange(item.id, { itemName: e.target.value })}
                            onBlur={() => saveItem(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder="Item name"
                            className={`input text-base md:text-sm !py-2 w-full min-h-[44px] font-medium ${
                              item.purchased ? "line-through text-muted bg-transparent border-transparent" : ""
                            }`}
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <select
                            value={edit.categoryId}
                            disabled={item.purchased}
                            onChange={(e) => {
                              handleItemFieldChange(item.id, { categoryId: e.target.value });
                              // Auto-save category change immediately
                              setTimeout(() => saveItem(item.id), 50);
                            }}
                            className="input text-base md:text-sm !py-2 w-full min-h-[44px] cursor-pointer text-xs"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Quantity, Unit Price, Total Price, Status */}
                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
                        {/* Quantity */}
                        <div className="col-span-1 sm:col-span-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">
                              Qty:
                            </span>
                            <input
                              type="text"
                              value={edit.quantity}
                              disabled={item.purchased}
                              onChange={(e) => handleItemFieldChange(item.id, { quantity: e.target.value })}
                              onBlur={() => saveItem(item.id)}
                              className="input text-base md:text-sm !py-2 !pl-10 w-full min-h-[44px]"
                            />
                          </div>
                        </div>

                        {/* Unit Price */}
                        <div className="col-span-1 sm:col-span-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">
                              Unit:
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Unit ₦"
                              value={edit.unitPrice}
                              disabled={item.purchased}
                              onChange={(e) => handleItemFieldChange(item.id, { unitPrice: e.target.value })}
                              onBlur={() => saveItem(item.id)}
                              className="input text-base md:text-sm !py-2 !pl-11 w-full min-h-[44px]"
                            />
                          </div>
                        </div>

                        {/* Total Price */}
                        <div className="col-span-2 sm:col-span-4">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">
                              Total:
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Total ₦"
                              value={edit.amount}
                              disabled={item.purchased}
                              onChange={(e) => handleItemFieldChange(item.id, { amount: e.target.value })}
                              onBlur={() => saveItem(item.id)}
                              className="input text-base md:text-sm !py-2 !pl-12 w-full min-h-[44px] font-semibold"
                            />
                          </div>
                        </div>

                        {/* Save status badge */}
                        <div className="col-span-2 sm:col-span-2 flex items-center justify-end text-xs">
                          {edit.saving ? (
                            <span className="text-muted text-[11px] animate-pulse">Saving…</span>
                          ) : edit.savedPulse ? (
                            <span className="text-brand text-[11px] font-medium">✓ Saved</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Logged into ledger notification badge for purchased items */}
                      {item.purchased && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-brand font-medium bg-brand/10 rounded-lg px-2.5 py-1.5 mt-1">
                          <div className="flex items-center gap-1.5">
                            <span>✓</span>
                            <span>
                              Logged to Ledger: <Money value={item.amount} className="font-semibold" /> on{" "}
                              {item.purchasedAt ? item.purchasedAt.slice(0, 10) : todayLagos()}
                            </span>
                          </div>
                          <Link href="/ledger" className="underline text-[11px] hover:text-fg">
                            View in ledger →
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Delete Item Button */}
                    <div className="pt-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id, item.itemName)}
                        disabled={isDeleting}
                        aria-label={`Delete ${item.itemName}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger-soft/40 transition-colors touch-manipulation active:scale-95"
                      >
                        {isDeleting ? "…" : "🗑"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
