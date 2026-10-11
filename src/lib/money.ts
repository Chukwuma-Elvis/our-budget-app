// Kept free of server-only imports so it can be used in client components too.

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type MoneyInput = string | number | { toString(): string };

/** Formats an amount as Naira, e.g. ₦12,500.00 (negative: -₦3,000.00). */
export function formatNaira(value: MoneyInput): string {
  return naira.format(Number(value.toString()));
}

/**
 * Parses user input like "12,500", "12500.5" or "₦ 1,200.00" into a normalised
 * two-decimal string, or null if it is not a valid amount.
 */
export function parseAmount(input: string): string | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export type PriceCalculationState = {
  quantity: string;
  unitPrice: string;
  amount: string;
  lastEditedPrice?: "unitPrice" | "amount";
};

/**
 * Calculates unit price from total price and quantity, or total price from unit price and quantity.
 * Automatically respects whichever price field the user entered last, avoiding feedback loops.
 */
export function updatePriceFields(
  current: PriceCalculationState,
  update: { quantity?: string; unitPrice?: string; amount?: string; totalPrice?: string },
): PriceCalculationState {
  const nextAmt = update.amount ?? update.totalPrice;
  const next: PriceCalculationState = {
    ...current,
    ...(update.quantity !== undefined ? { quantity: update.quantity } : {}),
    ...(update.unitPrice !== undefined ? { unitPrice: update.unitPrice } : {}),
    ...(nextAmt !== undefined ? { amount: nextAmt } : {}),
  };

  if ("unitPrice" in update) {
    next.lastEditedPrice = "unitPrice";
    if (next.unitPrice.trim() === "") {
      next.amount = "";
      next.lastEditedPrice = undefined;
    } else {
      const parsedUnit = parseAmount(next.unitPrice);
      const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
      if (parsedUnit !== null) {
        next.amount = (q * Number(parsedUnit)).toFixed(2);
      }
    }
  } else if ("amount" in update || "totalPrice" in update) {
    next.lastEditedPrice = "amount";
    if (next.amount.trim() === "") {
      next.unitPrice = "";
      next.lastEditedPrice = undefined;
    } else {
      const parsedTotal = parseAmount(next.amount);
      const q = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
      if (parsedTotal !== null) {
        next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
      }
    }
  } else if ("quantity" in update) {
    const q = Number(next.quantity);
    if (q > 0) {
      const preferTotal =
        next.lastEditedPrice === "amount" ||
        (!next.lastEditedPrice && Boolean(next.amount) && !next.unitPrice);

      if (preferTotal) {
        const parsedTotal = parseAmount(next.amount);
        if (parsedTotal !== null) {
          next.unitPrice = (Number(parsedTotal) / q).toFixed(2);
        }
      } else {
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
  }

  return next;
}
