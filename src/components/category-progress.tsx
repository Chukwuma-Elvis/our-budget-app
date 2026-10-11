"use client";

import type { Summary } from "@/lib/client";
import { Money, SpendBar, StatusNote } from "./ui";

export function CategoryProgress({ summary }: { summary: Summary }) {
  const rows = summary.categories.filter((c) => Number(c.budget) > 0 || Number(c.spent) > 0);
  return (
    <ul className="divide-y divide-border">
      {rows.map((c) => (
        <li key={c.categoryId} className="py-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate">
                {c.name}
                {c.archived && <span className="ml-1 text-xs font-normal text-muted">(removed)</span>}
              </span>
            </span>
            <span className="shrink-0 text-sm">
              <Money value={c.spent} status={c.status} /> <span className="text-muted">of</span>{" "}
              <Money value={c.budget} className="text-muted" />
            </span>
          </div>
          <SpendBar percent={c.percent} status={c.status} />
          <div className="mt-1">
            <StatusNote status={c.status} remaining={c.remaining} />
          </div>
        </li>
      ))}
    </ul>
  );
}
