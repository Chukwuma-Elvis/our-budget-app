import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { RP_NAME, rpConfig } from "@/lib/webauthn";

const CHALLENGE_MINUTES = 5;

async function storeChallenge(kind: "passkey_register" | "passkey_login", challenge: string, userId?: string) {
  const row = await db.authChallenge.create({
    data: {
      kind,
      userId: userId ?? null,
      valueHash: challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
    },
  });
  return row.id;
}

async function consumeChallenge(id: string, kind: "passkey_register" | "passkey_login", userId?: string) {
  const row = await db.authChallenge.findFirst({
    where: { id, kind, usedAt: null, expiresAt: { gt: new Date() }, ...(userId ? { userId } : {}) },
  });
  if (!row) throw badRequest("That biometric request expired. Please try again.");
  const claimed = await db.authChallenge.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw badRequest("That biometric request was already used. Please try again.");
  return row.valueHash;
}

export async function registrationOptions(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { passkeys: true } });
  const { rpID } = rpConfig();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.phone,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  const challengeId = await storeChallenge("passkey_register", options.challenge, userId);
  return { options, challengeId };
}

export async function verifyRegistration(
  userId: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  deviceLabel?: string,
) {
  const expectedChallenge = await consumeChallenge(challengeId, "passkey_register", userId);
  const { rpID, origin } = rpConfig();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified) throw badRequest("Could not verify your biometrics");
  const { credential } = verification.registrationInfo;
  await db.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      deviceLabel: deviceLabel || null,
    },
  });
}

export async function loginOptions() {
  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const challengeId = await storeChallenge("passkey_login", options.challenge);
  return { options, challengeId };
}

export async function verifyLogin(challengeId: string, response: AuthenticationResponseJSON) {
  const expectedChallenge = await consumeChallenge(challengeId, "passkey_login");
  const passkey = await db.passkey.findUnique({ where: { credentialId: response.id } });
  if (!passkey) throw badRequest("This device is not set up for biometric login. Use your password.");
  const { rpID, origin } = rpConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: passkey.transports as AuthenticatorTransport[],
    },
  });
  if (!verification.verified) throw badRequest("Could not verify your biometrics");
  await db.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return passkey.userId;
}

export async function listPasskeys(userId: string) {
  const rows = await db.passkey.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    deviceLabel: p.deviceLabel ?? "This device",
    createdAt: p.createdAt.toISOString(),
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function deletePasskey(userId: string, id: string) {
  const result = await db.passkey.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw notFound("Device not found");
}
