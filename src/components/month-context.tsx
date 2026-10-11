"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { addMonths, currentMonthKey, isMonthKey } from "@/lib/dates";

type MonthCtx = {
  month: string;
  setMonth: (m: string) => void;
  isCurrent: boolean;
  isFuture: boolean;
  currentMonth: string;
  nextMonth: string;
};

const Ctx = createContext<MonthCtx | null>(null);
const KEY = "bt_month";

export function MonthProvider({ children }: { children: ReactNode }) {
  const currentMonth = currentMonthKey();
  const nextMonth = addMonths(currentMonth, 1);
  const [month, setMonthState] = useState(currentMonth);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved && isMonthKey(saved)) setMonthState(saved);
    } catch {
      /* storage unavailable: keep the current month */
    }
  }, []);

  const setMonth = (m: string) => {
    setMonthState(m);
    try {
      sessionStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
  };

  return (
    <Ctx.Provider
      value={{
        month,
        setMonth,
        isCurrent: month === currentMonth,
        isFuture: month > currentMonth,
        currentMonth,
        nextMonth,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMonth(): MonthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMonth must be used inside MonthProvider");
  return ctx;
}
