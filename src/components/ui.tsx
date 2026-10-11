"use client";

import { useEffect, type ReactNode } from "react";
import { formatNaira } from "@/lib/money";
import type { SpendStatus } from "@/lib/status";

const TEXT: Record<SpendStatus, string> = {
  ok: "text-fg",
  warning: "text-warn",
  overdrawn: "text-danger",
};

/** Naira amount. Overdrawn amounts render red and bold. */
export function Money({
  value,
  status = "ok",
  className = "",
}: {
  value: string | number;
  status?: SpendStatus;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${TEXT[status]} ${status === "overdrawn" ? "font-semibold" : ""} ${className}`}>
      {formatNaira(value)}
    </span>
  );
}

const BAR: Record<SpendStatus, string> = {
  ok: "bg-brand",
  warning: "bg-warn",
  overdrawn: "bg-danger",
};

export function SpendBar({ percent, status }: { percent: number; status: SpendStatus }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-border"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
    >
      <div className={`h-full rounded-full ${BAR[status]}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

/** Text + icon so the red state never relies on colour alone. */
export function StatusNote({ status, remaining }: { status: SpendStatus; remaining: string }) {
  if (status === "overdrawn") {
    return (
      <span className="text-sm font-medium text-danger">
        ⚠ Over by {formatNaira(Math.abs(Number(remaining)))}
      </span>
    );
  }
  if (status === "warning") {
    return <span className="text-sm font-medium text-warn">{formatNaira(remaining)} left (almost used)</span>;
  }
  return <span className="text-sm text-muted">{formatNaira(remaining)} left</span>;
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-6 text-center text-sm text-muted">{label}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-5 pb-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] sm:max-w-md sm:rounded-2xl sm:pb-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        <div className="mt-1 font-normal">{children}</div>
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
