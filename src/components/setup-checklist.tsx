"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFetch, type Me, type Summary } from "@/lib/client";
import { defaultDeviceLabel, enrollPasskey, passkeysSupported } from "@/lib/passkey-client";

const DISMISS_KEY = "bt_checklist_dismissed";
const BIOMETRIC_KEY = "bt_biometric_prompt_dismissed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function SetupChecklist({ summary, hasExpenses }: { summary: Summary; hasExpenses: boolean }) {
  const { data: me, reload } = useFetch<Me>("/auth/me");
  const [dismissed, setDismissed] = useState(true);
  const [bioDismissed, setBioDismissed] = useState(true);
  const [supported, setSupported] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(readFlag(DISMISS_KEY));
    setBioDismissed(readFlag(BIOMETRIC_KEY));
    setSupported(passkeysSupported());
  }, []);

  async function enableBiometrics() {
    setBioError(null);
    try {
      await enrollPasskey(defaultDeviceLabel());
      await reload();
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Could not enable biometrics");
    }
  }

  const showBio = supported && !bioDismissed && me && me.passkeys.length === 0;

  const steps = [
    { done: summary.categories.some((c) => !c.archived), label: "Add categories", href: "/categories" },
    { done: Number(summary.totals.budget) > 0, label: "Set this month's budgets", href: "/categories" },
    { done: me ? !me.canInvite : false, label: "Invite your partner", href: "/settings" },
    { done: hasExpenses, label: "Log your first expense", href: "/log" },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <>
      {showBio && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Enable fingerprint / face login on this device?</div>
            <div className="text-sm text-muted">Your password will keep working as a backup.</div>
            {bioError && <div className="field-error">{bioError}</div>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={enableBiometrics}>
              Enable
            </button>
            <button
              className="btn"
              onClick={() => {
                writeFlag(BIOMETRIC_KEY);
                setBioDismissed(true);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {!dismissed && !allDone && me && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Get set up</h2>
            <button
              className="btn btn-ghost text-xs"
              onClick={() => {
                writeFlag(DISMISS_KEY);
                setDismissed(true);
              }}
            >
              Hide
            </button>
          </div>
          <ul className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span aria-hidden className={s.done ? "text-brand" : "text-muted"}>
                  {s.done ? "✔" : "○"}
                </span>
                {s.done ? (
                  <span className="text-muted line-through">{s.label}</span>
                ) : (
                  <Link href={s.href} className="text-brand underline">
                    {s.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

