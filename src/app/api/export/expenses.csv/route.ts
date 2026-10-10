import { authed, parseQuery } from "@/lib/api";
import { expenseListQuery } from "@/schemas";
import { allExpensesForExport } from "@/server/expenses.service";

// Guards against spreadsheet formula injection from user-entered text.
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = authed(async (req, session) => {
  const { page: _page, pageSize: _size, ...filter } = parseQuery(req, expenseListQuery);
  const rows = await allExpensesForExport(session.accountId, filter);
  const header = ["Date", "Item", "Category", "Amount (NGN)", "Added by", "Note"];
  const lines = rows.map((e) =>
    [e.spentOn, e.itemName, e.category.name, e.amount, e.createdBy.displayName, e.note ?? ""].map(cell).join(","),
  );
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const name = filter.month ? `expenses-${filter.month}.csv` : "expenses-all.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});
