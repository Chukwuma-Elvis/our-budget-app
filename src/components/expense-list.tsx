"use client";

import { formatDate } from "@/lib/dates";
import type { Expense } from "@/lib/client";
import { Empty, Money } from "./ui";

export function ExpenseList({
  items,
  onEdit,
  onDelete,
  emptyText = "No expenses yet.",
}: {
  items: Expense[];
  onEdit?: (e: Expense) => void;
  onDelete?: (e: Expense) => void;
  emptyText?: string;
}) {
  if (items.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{e.itemName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="size-2 rounded-full" style={{ background: e.category.color }} />
                {e.category.name}
                {e.category.archived && " (removed)"}
              </span>
              <span>· {formatDate(e.spentOn)}</span>
              <span>
                · added by <strong className="font-semibold text-fg">{e.createdBy.displayName}</strong>
              </span>
              {e.updatedBy && <span>· edited by {e.updatedBy.displayName}</span>}
              {e.recurring && <span>· recurring</span>}
            </div>
            {e.note && <div className="mt-1 text-xs text-muted">{e.note}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Money value={e.amount} className="font-medium" />
            {(onEdit || onDelete) && (
              <div className="flex gap-1">
                {onEdit && (
                  <button className="btn btn-ghost !min-h-8 !px-2 text-xs" onClick={() => onEdit(e)}>
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button className="btn btn-ghost !min-h-8 !px-2 text-xs text-danger" onClick={() => onDelete(e)}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
