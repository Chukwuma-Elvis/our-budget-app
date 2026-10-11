"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ErrorNote, Money } from "./ui";
import { api, type Category } from "@/lib/client";
import { formatNaira, parseAmount } from "@/lib/money";
import { todayLagos } from "@/lib/dates";
import { compressImageFile } from "@/lib/image-compress";
import type { ParsedReceiptResult } from "@/server/ai-receipt.service";

type ReceiptScannerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSuccess: (count: number, merchant: string | null) => void;
};

type EditableItem = {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  categoryId: string;
  included: boolean;
};

type ScanStep = "upload" | "scanning" | "review";

export function ReceiptScannerModal({
  isOpen,
  onClose,
  categories,
  onSuccess,
}: ReceiptScannerModalProps) {
  const [step, setStep] = useState<ScanStep>("upload");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [merchant, setMerchant] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState<string>(todayLagos());
  const [receiptTotal, setReceiptTotal] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      setStep("upload");
      setPreviewUrl(null);
      setScanStatus("");
      setMerchant("");
      setReceiptDate(todayLagos());
      setReceiptTotal(null);
      setItems([]);
      setError(null);
      setSaving(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  async function processImage(file: File) {
    setError(null);
    setStep("scanning");
    setScanStatus("Compressing and optimizing receipt image…");

    try {
      const compressed = await compressImageFile(file, 1600, 0.85);
      setPreviewUrl(compressed.previewUrl);

      setScanStatus("Reading receipt with AI (extracting items, quantities & prices)…");

      const result = await api<ParsedReceiptResult>("/receipts/scan", {
        body: {
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        },
      });

      setMerchant(result.merchant || "");
      setReceiptDate(result.date || todayLagos());
      setReceiptTotal(result.total || null);

      const defaultCategoryId = categories[0]?.id || "";

      const mappedItems: EditableItem[] = (result.items || []).map((it) => ({
        id: it.id,
        name: it.name,
        quantity: String(it.quantity || 1),
        unitPrice: it.unitPrice || "0.00",
        totalPrice: it.totalPrice || "0.00",
        categoryId: it.suggestedCategoryId || defaultCategoryId,
        included: it.included !== false,
      }));

      // If AI didn't return any items, add one blank row for manual entry
      if (mappedItems.length === 0) {
        mappedItems.push({
          id: `item_manual_${Date.now()}`,
          name: "",
          quantity: "1",
          unitPrice: "",
          totalPrice: "",
          categoryId: defaultCategoryId,
          included: true,
        });
      }

      setItems(mappedItems);
      setStep("review");
    } catch (err) {
      console.error("Receipt scan failed:", err);
      setError(err instanceof Error ? err.message : "Failed to scan receipt. Please try again.");
      setStep("upload");
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void processImage(file);
    }
  }

  function updateItem(id: string, updates: Partial<EditableItem>) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };

        // Auto-recalculate amounts
        if ("quantity" in updates || "unitPrice" in updates) {
          const q = Number(next.quantity);
          const parsedUnit = parseAmount(next.unitPrice);
          if (q > 0 && parsedUnit !== null) {
            next.totalPrice = (q * Number(parsedUnit)).toFixed(2);
          }
        } else if ("totalPrice" in updates) {
          const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
          const parsedTotal = parseAmount(next.totalPrice);
          if (parsedTotal !== null) {
            next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
          }
        }

        return next;
      }),
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function addNewItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `item_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        quantity: "1",
        unitPrice: "",
        totalPrice: "",
        categoryId: categories[0]?.id || "",
        included: true,
      },
    ]);
  }

  function toggleAll(include: boolean) {
    setItems((prev) => prev.map((it) => ({ ...it, included: include })));
  }

  // Calculate totals
  const includedItems = useMemo(() => items.filter((it) => it.included), [items]);

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const it of includedItems) {
      const parsed = parseAmount(it.totalPrice);
      if (parsed) sum += Number(parsed);
    }
    return sum.toFixed(2);
  }, [includedItems]);

  const totalComparison = useMemo(() => {
    if (!receiptTotal) return null;
    const detected = Number(receiptTotal);
    const selected = Number(selectedTotal);
    const diff = Math.abs(detected - selected);
    const matches = diff < 0.01;
    return {
      detected,
      selected,
      diff,
      matches,
    };
  }, [receiptTotal, selectedTotal]);

  async function onSaveExpenses() {
    if (includedItems.length === 0) {
      setError("Please select at least one item to save");
      return;
    }

    // Validate each item
    for (const it of includedItems) {
      if (!it.name.trim()) {
        setError(`Please enter an item name for all selected items`);
        return;
      }
      const parsedAmount = parseAmount(it.totalPrice);
      if (!parsedAmount || Number(parsedAmount) <= 0) {
        setError(`Please enter a valid total price for "${it.name}"`);
        return;
      }
      if (!it.categoryId) {
        setError(`Please choose a category for "${it.name}"`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const payload = includedItems.map((it) => {
        const q = Number(it.quantity);
        const parsedUnit = parseAmount(it.unitPrice);
        const qtySuffix = q > 1 && parsedUnit ? `${q} @ ${formatNaira(parsedUnit)}` : "";
        const merchantPrefix = merchant.trim() ? `Receipt: ${merchant.trim()}` : "Receipt item";
        const note = qtySuffix ? `${merchantPrefix} (${qtySuffix})` : merchantPrefix;

        return {
          itemName: it.name.trim(),
          categoryId: it.categoryId,
          amount: it.totalPrice,
          spentOn: receiptDate,
          note,
        };
      });

      await api<{ count: number }>("/expenses/batch", { body: { items: payload } });

      onSuccess(includedItems.length, merchant.trim() || null);
      onClose();
    } catch (err) {
      console.error("Batch expense save failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save expenses to ledger");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scan Receipt with AI"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card p-4 pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] sm:max-w-4xl sm:rounded-2xl sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
              📷
            </span>
            <div>
              <h2 className="text-lg font-bold">AI Receipt Scanner</h2>
              <p className="text-xs text-muted">
                Extract prices, quantities & categories directly to your ledger
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost h-8 w-8 p-0 text-muted hover:text-fg"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain py-4">
          <ErrorNote message={error} />

          {/* STEP 1: Upload / Take Picture */}
          {step === "upload" && (
            <div className="space-y-6 py-4">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFileInputChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileInputChange}
              />

              <div
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-bg/50 p-8 text-center transition hover:border-brand cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-2xl text-brand">
                  🧾
                </div>
                <h3 className="text-base font-semibold">Take a photo or upload a receipt</h3>
                <p className="mt-1 max-w-sm text-xs text-muted">
                  Supports Supermarket receipts, grocery bills, pharmacy slips, and fuel receipts.
                  Images are automatically optimized before scanning.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                  >
                    📷 Snap with Camera
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    📁 Choose Photo / File
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-bg p-4 text-xs text-muted space-y-1">
                <p className="font-semibold text-fg">💡 Tips for best results:</p>
                <p>• Lay the receipt flat in good lighting without strong shadows.</p>
                <p>• Make sure the store name, date, item lines, and total are clearly visible.</p>
                <p>• You can edit, uncheck, or add any items before saving to your ledger.</p>
              </div>
            </div>
          )}

          {/* STEP 2: Scanning / AI Processing */}
          {step === "scanning" && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              {previewUrl && (
                <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-border shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Receipt preview" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-brand/20 animate-pulse" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                <p className="font-medium text-brand">{scanStatus}</p>
              </div>
              <p className="max-w-xs text-xs text-muted">
                Extracting items, calculating line totals, and matching your budget categories…
              </p>
            </div>
          )}

          {/* STEP 3: Review & Edit Items */}
          {step === "review" && (
            <div className="space-y-5">
              {/* Receipt Metadata Header */}
              <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-border bg-bg/40 p-3">
                <div>
                  <label className="text-xs font-medium text-muted">Store / Merchant</label>
                  <input
                    className="input mt-1 h-9 text-sm"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="e.g. Shoprite, Justrite"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Receipt Date</label>
                  <input
                    type="date"
                    className="input mt-1 h-9 text-sm"
                    value={receiptDate}
                    max={todayLagos()}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Receipt Printed Total</label>
                  <div className="mt-1 flex h-9 items-center px-3 rounded-lg border border-border bg-card text-sm font-semibold">
                    {receiptTotal ? formatNaira(receiptTotal) : "Not detected"}
                  </div>
                </div>
              </div>

              {/* Items Table Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    Extracted Items ({includedItems.length} of {items.length} selected)
                  </span>
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      className="text-brand underline hover:opacity-80"
                      onClick={() => toggleAll(true)}
                    >
                      Select all
                    </button>
                    <span className="text-muted">·</span>
                    <button
                      type="button"
                      className="text-muted underline hover:text-fg"
                      onClick={() => toggleAll(false)}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost h-8 text-xs font-medium text-brand hover:bg-brand/10"
                  onClick={addNewItem}
                >
                  + Add another line
                </button>
              </div>

              {/* Items List (Responsive: Cards on Mobile, Table on Desktop) */}
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 transition ${
                      item.included
                        ? "border-border bg-card shadow-xs"
                        : "border-border/50 bg-bg/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={(e) => updateItem(item.id, { included: e.target.checked })}
                        className="mt-2.5 h-4 w-4 rounded accent-brand"
                        title="Include in ledger"
                      />

                      {/* Main Fields Grid */}
                      <div className="flex-1 grid gap-2 sm:grid-cols-12 sm:items-center">
                        {/* Item Name */}
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-medium text-muted sm:hidden">
                            Item Name
                          </label>
                          <input
                            className="input h-9 text-sm"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, { name: e.target.value })}
                            placeholder={`Item #${index + 1}`}
                          />
                        </div>

                        {/* Quantity */}
                        <div className="grid grid-cols-2 gap-2 sm:col-span-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] font-medium text-muted sm:hidden">
                              Qty
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              className="input h-9 text-sm"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                              placeholder="1"
                              title="Quantity"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-muted sm:hidden">
                              Unit ₦
                            </label>
                            <input
                              className="input h-9 text-sm"
                              inputMode="decimal"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                              placeholder="Unit ₦"
                              title="Unit Price"
                            />
                          </div>
                        </div>

                        {/* Total Price */}
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-muted sm:hidden">
                            Total ₦
                          </label>
                          <input
                            className="input h-9 text-sm font-semibold"
                            inputMode="decimal"
                            value={item.totalPrice}
                            onChange={(e) => updateItem(item.id, { totalPrice: e.target.value })}
                            placeholder="Total ₦"
                            title="Total Price"
                          />
                        </div>

                        {/* Category Selector */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-muted sm:hidden">
                            Category
                          </label>
                          <select
                            className="input h-9 text-sm"
                            value={item.categoryId}
                            onChange={(e) => updateItem(item.id, { categoryId: e.target.value })}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="mt-1 h-8 w-8 text-muted hover:text-danger rounded-lg transition"
                        title="Remove item"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Calculation & Discrepancy Banner */}
              <div className="rounded-xl border border-border bg-bg/70 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-muted font-semibold">
                      Selected Items Total
                    </span>
                    <div className="text-xl font-bold">
                      <Money value={selectedTotal} />
                    </div>
                  </div>
                  {totalComparison && (
                    <div
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        totalComparison.matches
                          ? "bg-ok-soft text-brand"
                          : "bg-warn-soft text-warn"
                      }`}
                    >
                      {totalComparison.matches ? (
                        <span>✔ Matches receipt total exactly ({formatNaira(totalComparison.detected)})</span>
                      ) : (
                        <span>
                          ℹ Receipt total was {formatNaira(totalComparison.detected)} (Diff:{" "}
                          {formatNaira(totalComparison.diff)})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-border pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
          {step === "review" ? (
            <>
              <button
                type="button"
                className="btn btn-ghost text-xs w-full sm:w-auto"
                onClick={() => setStep("upload")}
                disabled={saving}
              >
                ← Retake / Scan Another
              </button>
              <div className="flex w-full sm:w-auto gap-2">
                <button
                  type="button"
                  className="btn flex-1 sm:flex-initial"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex-1 sm:flex-initial"
                  onClick={onSaveExpenses}
                  disabled={saving || includedItems.length === 0}
                >
                  {saving
                    ? "Adding to Ledger…"
                    : `Add ${includedItems.length} ${
                        includedItems.length === 1 ? "Item" : "Items"
                      } (${formatNaira(selectedTotal)})`}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                className="btn w-full sm:w-auto"
                onClick={onClose}
                disabled={step === "scanning"}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
