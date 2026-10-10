import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center text-2xl font-bold text-brand">₦ Budget Tracker</div>
      <div className="card">{children}</div>
    </main>
  );
}
