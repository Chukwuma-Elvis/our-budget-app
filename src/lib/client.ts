"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.message ?? "Something went wrong", json?.error?.fields);
  }
  return json as T;
}

/** Fetches `path` (pass null to skip) and exposes a `reload` for use after changes. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++latest.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (id === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === latest.current) setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}

export type Summary = {
  month: string;
  categories: {
    categoryId: string;
    name: string;
    color: string;
    archived: boolean;
    budget: string;
    spent: string;
    remaining: string;
    percent: number;
    status: "ok" | "warning" | "overdrawn";
    overdrawn: boolean;
  }[];
  totals: {
    budget: string;
    spent: string;
    remaining: string;
    percent: number;
    status: "ok" | "warning" | "overdrawn";
    overdrawn: boolean;
  };
};

export type Category = { id: string; name: string; color: string; archived: boolean };

export type Expense = {
  id: string;
  itemName: string;
  amount: string;
  spentOn: string;
  note: string | null;
  category: Category;
  createdBy: { id: string; displayName: string };
  updatedBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
  recurring: boolean;
};

export type ExpenseList = {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
  totalAmount: string;
};

export type Me = {
  user: { id: string; displayName: string };
  account: { id: string; name: string };
  members: { id: string; displayName: string; phone: string }[];
  canInvite: boolean;
  passkeys: { id: string; deviceLabel: string; createdAt: string; lastUsedAt: string | null }[];
};
