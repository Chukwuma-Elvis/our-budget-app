export type SpendStatus = "ok" | "warning" | "overdrawn";

export const WARNING_THRESHOLD = 0.8;

/** Overdrawn only when spent is strictly greater than the budget. */
export function spendStatus(spent: number, budget: number): SpendStatus {
  if (spent > budget) return "overdrawn";
  if (budget > 0 && spent / budget >= WARNING_THRESHOLD) return "warning";
  return "ok";
}

export function percentUsed(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.round((spent / budget) * 100);
}
