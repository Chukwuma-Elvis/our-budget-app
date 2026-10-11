import { z } from "zod";
import { isDateString, isMonthKey } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number" });
    return phone ?? "";
  });

export const nameSchema = z.string().trim().min(1, "Enter your name").max(60);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);

export const monthSchema = z.string().refine(isMonthKey, "Use the format YYYY-MM");
export const dateSchema = z.string().refine(isDateString, "Use the format YYYY-MM-DD");

/** Naira amount; accepts "12,500", "12500.50" or a number. Returns a 2-decimal string. */
export const amountSchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const parsed = parseAmount(String(v));
  if (!parsed) ctx.addIssue({ code: "custom", message: "Enter a valid amount in naira" });
  return parsed ?? "0.00";
});

export const positiveAmountSchema = amountSchema.refine((v) => Number(v) > 0, "Amount must be more than ₦0");

export const registerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  password: passwordSchema,
  setupCode: z.string().min(1, "Enter the setup code"),
});

export const joinSchema = z.object({
  token: z.string().min(10),
  name: nameSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Enter your password"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema,
});

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #22c55e");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(40),
  color: colorSchema.optional(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: colorSchema.optional(),
});

export const budgetSetSchema = z.object({ amount: amountSchema });

export const budgetCopySchema = z.object({ from: monthSchema, to: monthSchema });

export const monthQuery = z.object({ month: monthSchema });

export const expenseCreateSchema = z.object({
  itemName: z.string().trim().min(1, "Enter the item name").max(120),
  categoryId: z.uuid("Choose a category"),
  amount: positiveAmountSchema,
  spentOn: dateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const expenseUpdateSchema = z.object({
  itemName: z.string().trim().min(1).max(120).optional(),
  categoryId: z.uuid().optional(),
  amount: positiveAmountSchema.optional(),
  spentOn: dateSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const expenseListQuery = z.object({
  month: monthSchema.optional(),
  categoryId: z.uuid().optional(),
  userId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const monthlyQuery = z.object({ from: monthSchema.optional(), to: monthSchema.optional() });

export const recurringCreateSchema = z.object({
  itemName: z.string().trim().min(1, "Enter the item name").max(120),
  categoryId: z.uuid("Choose a category"),
  amount: positiveAmountSchema,
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  startsOn: dateSchema,
});

export const recurringUpdateSchema = z.object({ active: z.boolean() });

export const passkeyVerifySchema = z.object({
  challengeId: z.uuid(),
  response: z.any(),
  deviceLabel: z.string().trim().max(60).optional(),
});

export const receiptScanSchema = z.object({
  imageBase64: z.string().min(1, "Receipt image is required"),
  mimeType: z
    .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/jpg"])
    .default("image/jpeg"),
});

export const expenseBatchItemSchema = z.object({
  itemName: z.string().trim().min(1, "Enter the item name").max(120),
  categoryId: z.uuid("Choose a category"),
  amount: positiveAmountSchema,
  spentOn: dateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const expenseBatchSchema = z.object({
  items: z.array(expenseBatchItemSchema).min(1, "Select at least one item to save").max(100),
});
