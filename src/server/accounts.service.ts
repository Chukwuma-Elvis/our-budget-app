import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, conflict, forbidden, tooMany } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hashToken, newToken } from "@/lib/tokens";

export const MAX_MEMBERS = 2;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVITE_DAYS = 3;
const RESET_HOURS = 1;

export const INVALID_LOGIN = "Incorrect phone number or password";

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Best-effort throttle for setup-code guesses (per server instance).
const setupAttempts = new Map<string, { count: number; resetAt: number }>();

function throttleSetup(key: string) {
  const now = Date.now();
  const entry = setupAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    setupAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return;
  }
  entry.count += 1;
  if (entry.count > 10) throw tooMany();
}

export async function registrationOpen(): Promise<boolean> {
  return (await db.account.count()) === 0;
}

function isUniqueError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function registerFirstUser(
  input: { name: string; phone: string; password: string; setupCode: string },
  clientKey: string,
) {
  throttleSetup(clientKey);
  const expected = process.env.SETUP_CODE;
  if (!expected) throw forbidden("Registration is closed");
  if (!(await registrationOpen())) throw forbidden("Registration is closed");
  if (!sameSecret(input.setupCode, expected)) {
    throw badRequest("That setup code is not correct", { setupCode: "Incorrect setup code" });
  }

  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      // Serialise concurrent registrations so only one account can ever be created this way.
      await tx.$executeRaw`LOCK TABLE accounts IN EXCLUSIVE MODE`;
      if ((await tx.account.count()) > 0) throw forbidden("Registration is closed");
      const account = await tx.account.create({ data: { name: "Our Budget" } });
      return tx.user.create({
        data: { accountId: account.id, phone: input.phone, displayName: input.name, passwordHash },
      });
    });
  } catch (err) {
    if (isUniqueError(err)) throw conflict("That phone number is already in use");
    throw err;
  }
}

export async function loginWithPassword(phone: string, password: string) {
  const user = await db.user.findUnique({ where: { phone } });
  if (!user) throw badRequest(INVALID_LOGIN);
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw tooMany("Too many wrong attempts. Try again in a few minutes, or ask your partner for a reset link.");
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const attempts = user.failedAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data:
        attempts >= MAX_FAILED_ATTEMPTS
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedAttempts: attempts },
    });
    throw badRequest(INVALID_LOGIN);
  }
  if (user.failedAttempts > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  }
  return user;
}

export async function listMembers(accountId: string) {
  return db.user.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: { id: true, displayName: true, phone: true },
  });
}

export async function createInvite(accountId: string, userId: string) {
  const members = await db.user.count({ where: { accountId } });
  if (members >= MAX_MEMBERS) throw conflict("This account already has two members");
  // Only one live invite at a time.
  await db.invite.deleteMany({ where: { accountId, usedAt: null } });
  const token = newToken();
  const invite = await db.invite.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      createdBy: userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  return { token, expiresAt: invite.expiresAt };
}

export async function inspectInvite(token: string) {
  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { creator: { select: { displayName: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return { valid: false as const };
  const members = await db.user.count({ where: { accountId: invite.accountId } });
  if (members >= MAX_MEMBERS) return { valid: false as const };
  return { valid: true as const, invitedBy: invite.creator?.displayName ?? null };
}

export async function joinWithInvite(input: { token: string; name: string; phone: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(input.token) } });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        throw badRequest("This invite link is invalid or has expired. Ask your partner for a new one.");
      }
      // Lock the account row so two simultaneous joins cannot both pass the member check.
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${invite.accountId}::uuid FOR UPDATE`;
      const members = await tx.user.count({ where: { accountId: invite.accountId } });
      if (members >= MAX_MEMBERS) throw conflict("This account already has two members");
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw badRequest("This invite link has already been used");
      return tx.user.create({
        data: { accountId: invite.accountId, phone: input.phone, displayName: input.name, passwordHash },
      });
    });
  } catch (err) {
    if (isUniqueError(err)) throw conflict("That phone number is already in use");
    throw err;
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw badRequest("Your current password is not correct", { currentPassword: "Incorrect password" });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}

/** A member generates a reset link for the *other* member of the account. */
export async function createResetLink(accountId: string, actorId: string, targetUserId: string) {
  if (targetUserId === actorId) throw badRequest("Use Change password for your own account");
  const target = await db.user.findFirst({ where: { id: targetUserId, accountId } });
  if (!target) throw forbidden();
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_HOURS * 3_600_000);
  await db.authChallenge.create({
    data: { userId: target.id, kind: "password_reset", valueHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt, forName: target.displayName };
}

export async function resetPassword(token: string, newPassword: string) {
  const challenge = await db.authChallenge.findFirst({
    where: { kind: "password_reset", valueHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!challenge?.userId) throw badRequest("This reset link is invalid or has expired");
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({
      where: { id: challenge.userId },
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    }),
    db.authChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } }),
  ]);
  return challenge.userId;
}
