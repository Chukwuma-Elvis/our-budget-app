"use client";

import { useState, type FormEvent } from "react";
import { ErrorNote, Field, Loading, PageTitle } from "@/components/ui";
import { ApiError, api, useFetch, type Me } from "@/lib/client";
import { formatDate } from "@/lib/dates";
import { defaultDeviceLabel, enrollPasskey, passkeysSupported } from "@/lib/passkey-client";

function LinkBox({ url, note }: { url: string; note: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  async function share() {
    try {
      await navigator.share({ url });
    } catch {
      /* cancelled */
    }
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-ok-soft p-3">
      <input className="input text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={copy}>
          {copied ? "Copied ✔" : "Copy link"}
        </button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button className="btn" onClick={share}>
            Share…
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setDone(false);
    try {
      await api("/auth/password", { body: { currentPassword: current, newPassword: next } });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Current password" error={fields.currentPassword}>
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password (8+ characters)" error={fields.newPassword}>
        <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <ErrorNote message={error} />
      {done && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm">✔ Password changed.</p>}
      <button className="btn btn-primary" type="submit">
        Change password
      </button>
    </form>
  );
}

export default function SettingsPage() {
  const me = useFetch<Me>("/auth/me");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    try {
      const r = await api<{ token: string }>("/invites", { method: "POST", body: {} });
      setInviteUrl(`${window.location.origin}/join/${r.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite");
    }
  }

  async function resetFor(userId: string) {
    setError(null);
    try {
      const r = await api<{ token: string; forName: string }>("/auth/reset", { body: { userId } });
      setResetUrl({ url: `${window.location.origin}/reset/${r.token}`, name: r.forName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reset link");
    }
  }

  async function addDevice() {
    setError(null);
    try {
      await enrollPasskey(defaultDeviceLabel());
      await me.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable biometrics");
    }
  }

  async function removeDevice(id: string) {
    if (!window.confirm("Remove biometric login for this device?")) return;
    setError(null);
    try {
      await api(`/auth/passkeys/${id}`, { method: "DELETE" });
      await me.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove device");
    }
  }

  if (me.loading && !me.data) return <Loading />;
  if (!me.data) return <ErrorNote message={me.error ?? "Could not load"} />;
  const { members, canInvite, passkeys, user } = me.data;

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />
      <ErrorNote message={error} />

      <section className="card">
        <h2 className="mb-2 font-semibold">Members</h2>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <strong>{m.displayName}</strong>
                {m.id === user.id && <span className="ml-1 text-muted">(you)</span>}
                <span className="ml-2 text-muted">{m.phone}</span>
              </span>
              {m.id !== user.id && (
                <button className="btn" onClick={() => resetFor(m.id)}>
                  Create password reset link
                </button>
              )}
            </li>
          ))}
        </ul>
        {resetUrl && (
          <LinkBox
            url={resetUrl.url}
            note={`Send this to ${resetUrl.name}. It works once and expires in 1 hour. Opening it lets them set a new password.`}
          />
        )}
        {canInvite ? (
          <div className="mt-3">
            <button className="btn btn-primary" onClick={invite}>
              Invite your partner
            </button>
            {inviteUrl && (
              <LinkBox url={inviteUrl} note="Single-use link. It expires in 3 days. Send it by WhatsApp or SMS." />
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">This account has two members, so it is full.</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Fingerprint / face login</h2>
        {passkeys.length === 0 ? (
          <p className="mb-2 text-sm text-muted">Not enabled on any device yet.</p>
        ) : (
          <ul className="mb-2 divide-y divide-border text-sm">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>
                  {p.deviceLabel}
                  <span className="ml-2 text-muted">
                    added {formatDate(p.createdAt.slice(0, 10))}
                    {p.lastUsedAt ? `, last used ${formatDate(p.lastUsedAt.slice(0, 10))}` : ""}
                  </span>
                </span>
                <button className="btn btn-ghost text-danger" onClick={() => removeDevice(p.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {typeof window !== "undefined" && passkeysSupported() ? (
          <button className="btn" onClick={addDevice}>
            Enable on this device
          </button>
        ) : (
          <p className="text-sm text-muted">This browser does not support biometric login.</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Change password</h2>
        <ChangePassword />
      </section>
    </div>
  );
}
