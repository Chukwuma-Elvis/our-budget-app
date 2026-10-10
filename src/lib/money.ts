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
