"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./client";

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

function friendly(err: unknown): never {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    throw new Error("Biometric check was cancelled. Try again or use your password.");
  }
  if (name === "InvalidStateError") throw new Error("This device is already set up for biometric login.");
  throw err instanceof Error ? err : new Error("Biometric login failed");
}

export async function signInWithPasskey(): Promise<void> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeId: string }>(
    "/auth/passkey/login/options",
    { method: "POST", body: {} },
  );
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    friendly(err);
  }
  await api("/auth/passkey/login/verify", { method: "POST", body: { challengeId, response } });
}

export async function enrollPasskey(deviceLabel: string): Promise<void> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"]; challengeId: string }>(
    "/auth/passkey/register/options",
    { method: "POST", body: {} },
  );
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    friendly(err);
  }
  await api("/auth/passkey/register/verify", { method: "POST", body: { challengeId, response, deviceLabel } });
}

export function defaultDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Mac/.test(ua)) return "Mac";
  return "This device";
}
