"use client";

import { useMonth } from "@/components/month-context";
import { SpendingReport } from "@/components/spending-report";
import { PageTitle } from "@/components/ui";
import { monthLabel } from "@/lib/dates";

export default function SpendingPage() {
  const { month } = useMonth();
  return (
    <div>
      <PageTitle title={`Spending by category · ${monthLabel(month)}`} />
      <SpendingReport month={month} />
    </div>
  );
}
