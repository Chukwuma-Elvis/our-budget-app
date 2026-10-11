import { describe, expect, it } from "vitest";
import {
  addMonths,
  advanceDate,
  currentMonthKey,
  isDateString,
  isMonthKey,
  monthEnd,
  monthStart,
  todayLagos,
} from "@/lib/dates";
import { formatNaira, parseAmount } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { percentUsed, spendStatus } from "@/lib/status";
import { rpConfig } from "@/lib/webauthn";

describe("money", () => {
  it("formats naira with two decimals", () => {
    expect(formatNaira("12500")).toBe("₦12,500.00");
    expect(formatNaira(0)).toBe("₦0.00");
  });

  it("formats negatives for overdrafts", () => {
    expect(formatNaira("-3000")).toMatch(/-₦3,000\.00/);
  });

  it("parses user-entered amounts", () => {
    expect(parseAmount("12,500")).toBe("12500.00");
    expect(parseAmount("₦ 1,200.5")).toBe("1200.50");
    expect(parseAmount("007")).toBe("7.00");
    expect(parseAmount("0.99")).toBe("0.99");
  });

  it("rejects invalid amounts", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("1e5")).toBeNull();
  });
});

describe("spend status", () => {
  it("is overdrawn only when spent is strictly more than budget", () => {
    expect(spendStatus(10000, 10000)).toBe("warning");
    expect(spendStatus(10000.01, 10000)).toBe("overdrawn");
  });

  it("warns from 80% used", () => {
    expect(spendStatus(7999, 10000)).toBe("ok");
    expect(spendStatus(8000, 10000)).toBe("warning");
  });

  it("treats any spend with no budget as overdrawn", () => {
    expect(spendStatus(1, 0)).toBe("overdrawn");
    expect(spendStatus(0, 0)).toBe("ok");
  });

  it("computes percent used", () => {
    expect(percentUsed(5000, 10000)).toBe(50);
    expect(percentUsed(15000, 10000)).toBe(150);
    expect(percentUsed(0, 0)).toBe(0);
    expect(percentUsed(10, 0)).toBe(100);
  });
});

describe("phone numbers", () => {
  it("normalises Nigerian formats to E.164", () => {
    expect(normalizePhone("08012345678")).toBe("+2348012345678");
    expect(normalizePhone("0801 234 5678")).toBe("+2348012345678");
    expect(normalizePhone("+234 801 234 5678")).toBe("+2348012345678");
    expect(normalizePhone("2348012345678")).toBe("+2348012345678");
    expect(normalizePhone("8012345678")).toBe("+2348012345678");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("06012345678")).toBeNull();
    expect(normalizePhone("not a number")).toBeNull();
  });
});

describe("dates", () => {
  it("validates month keys and dates", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2028-02-29")).toBe(true);
  });

  it("computes month boundaries", () => {
    expect(monthStart("2026-10").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(monthEnd("2026-12").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("moves between months across year ends", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });

  it("uses Lagos time for the current day (UTC+1)", () => {
    // 23:30 UTC on the 31st is already the 1st in Lagos.
    expect(todayLagos(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    expect(currentMonthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(todayLagos(new Date("2026-10-31T22:30:00Z"))).toBe("2026-10-31");
  });

  it("advances recurring dates, clamping to month length", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2028-01-31", "monthly")).toBe("2028-02-29");
    expect(advanceDate("2026-10-10", "weekly")).toBe("2026-10-17");
    expect(advanceDate("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });
});

describe("webauthn config", () => {
  it("resolves rpID and origin with fallbacks", () => {
    const config = rpConfig();
    expect(config.rpID).toBeDefined();
    expect(config.origin).toMatch(/^https?:\/\//);
  });
});

