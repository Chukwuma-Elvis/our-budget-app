"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorNote, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkey-client";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [canUsePasskey, setCanUsePasskey] = useState(false);

  useEffect(() => setCanUsePasskey(passkeysSupported()), []);

  function done() {
    router.push("/");
    router.refresh();
  }

  async function onPasskey() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPasskey();
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric login failed");
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/auth/login", { body: { phone, password } });
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {canUsePasskey && (
        <>
          <button className="btn btn-primary w-full" onClick={onPasskey} disabled={busy}>
            Use fingerprint / face
          </button>
          <p className="text-center text-xs text-muted">or use your phone number and password</p>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field label="Phone number" error={fields.phone}>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="0801 234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!!fields.phone}
          />
        </Field>
        <Field label="Password" error={fields.password}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fields.password}
          />
        </Field>
        <ErrorNote message={error} />
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        First time here? <Link className="text-brand underline" href="/register">Set up the account</Link>. Joining your
        partner? Open the invite link they sent you. Forgot your password? Ask your partner for a reset link.
      </p>
    </div>
  );
}
