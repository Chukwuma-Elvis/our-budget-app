/**
 * Normalises a Nigerian phone number to E.164 (+234XXXXXXXXXX).
 * Accepts 080..., 80..., 234..., +234... with spaces/dashes. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+234\d{10}$/.test(digits)) national = digits.slice(4);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) national = digits;
  else return null;
  if (!/^[789]/.test(national)) return null;
  return `+234${national}`;
}
