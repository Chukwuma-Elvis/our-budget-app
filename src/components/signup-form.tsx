"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/client";

type Props =
  | { mode: "register" }
  | { mode: "join"; token: string }
  | { mode: "reset"; token: string };

const COPY = {
  register: { title: "Set up your account", button: "Create account" },
  join: { title: "Join your partner's budget", button: "Join" },
  reset: { title: "Choose a new password", button: "Save password" },
};

/** One form for registering, joining via invite, and password reset. */
export function SignupForm(props: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (props.mode === "register") {
        await api("/auth/register", { body: { name, phone, password, setupCode } });
      } else if (props.mode === "join") {
        await api("/auth/join", { body: { token: props.token, name, phone, password } });
      } else {
        await api("/auth/reset/confirm", { body: { token: props.token, newPassword: password } });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      if (err instanceof ApiError && err.fields) {
        setFields({ ...err.fields, ...(err.fields.newPassword ? { password: err.fields.newPassword } : {}) });
      }
      setBusy(false);
    }
  }

  const copy = COPY[props.mode];
  const needsProfile = props.mode !== "reset";

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <h1 className="text-lg font-semibold">{copy.title}</h1>
      {needsProfile && (
        <>
          <Field label="Your name (shown in the ledger)" error={fields.name}>
            <input
              className="input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!fields.name}
            />
          </Field>
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
        </>
      )}
      <Field label={props.mode === "reset" ? "New password" : "Password (8+ characters)"} error={fields.password}>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fields.password}
        />
      </Field>
      {props.mode === "register" && (
        <Field label="Setup code" error={fields.setupCode}>
          <input
            className="input"
            autoComplete="off"
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            aria-invalid={!!fields.setupCode}
          />
        </Field>
      )}
      <ErrorNote message={error} />
      <button className="btn btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Please wait…" : copy.button}
      </button>
    </form>
  );
}
