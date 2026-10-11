import { describe, expect, it } from "vitest";
import {
  cleanBase64,
  extractJsonFromAiResponse,
  parseReceiptResponse,
  sanitizeReceiptItems,
} from "@/server/ai-receipt.service";
import { expenseBatchSchema, receiptScanSchema } from "@/schemas";
import type { CategoryDto } from "@/server/categories.service";

const sampleCategories: CategoryDto[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Food & Groceries", color: "#16a34a", archived: false },
  { id: "22222222-2222-2222-2222-222222222222", name: "Utilities", color: "#ca8a04", archived: false },
  { id: "33333333-3333-3333-3333-333333333333", name: "Health", color: "#dc2626", archived: false },
];

describe("receipt base64 and json extraction", () => {
  it("cleans data URL prefixes from base64 string", () => {
    const prefixed = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
    expect(cleanBase64(prefixed)).toBe("/9j/4AAQSkZJRgABAQEASABIAAD");

    const pngPrefixed = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";
    expect(cleanBase64(pngPrefixed)).toBe("iVBORw0KGgoAAAANSUhEUgAA");

    const raw = "   /9j/4AAQSkZJRg==  ";
    expect(cleanBase64(raw)).toBe("/9j/4AAQSkZJRg==");
  });

  it("extracts json from raw text or markdown code fences", () => {
    const raw = `{"merchant":"Shoprite"}`;
    expect(extractJsonFromAiResponse(raw)).toBe(`{"merchant":"Shoprite"}`);

    const fenced = "```json\n{\n  \"merchant\": \"Spar\"\n}\n```";
    expect(extractJsonFromAiResponse(fenced)).toBe("{\n  \"merchant\": \"Spar\"\n}");

    const withCommentary = "Here is the parsed receipt:\n```json\n{\"merchant\":\"Justrite\"}\n```\nHope this helps!";
    expect(extractJsonFromAiResponse(withCommentary)).toBe("{\"merchant\":\"Justrite\"}");
  });
});

describe("sanitizeReceiptItems", () => {
  it("normalizes quantities, prices and matches category by ID", () => {
    const raw = [
      {
        name: "Golden Penny Spaghetti",
        quantity: 3,
        unitPrice: "1,500.00",
        totalPrice: "4,500.00",
        suggestedCategoryId: "11111111-1111-1111-1111-111111111111",
      },
    ];

    const sanitized = sanitizeReceiptItems(raw, sampleCategories);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].name).toBe("Golden Penny Spaghetti");
    expect(sanitized[0].quantity).toBe(3);
    expect(sanitized[0].unitPrice).toBe("1500.00");
    expect(sanitized[0].totalPrice).toBe("4500.00");
    expect(sanitized[0].suggestedCategoryId).toBe("11111111-1111-1111-1111-111111111111");
    expect(sanitized[0].suggestedCategoryName).toBe("Food & Groceries");
    expect(sanitized[0].included).toBe(true);
  });

  it("matches category by name when ID is not provided", () => {
    const raw = [
      {
        name: "Panadol Extra",
        quantity: 2,
        unitPrice: 800,
        totalPrice: 1600,
        suggestedCategory: "Health",
      },
    ];

    const sanitized = sanitizeReceiptItems(raw, sampleCategories);
    expect(sanitized[0].suggestedCategoryId).toBe("33333333-3333-3333-3333-333333333333");
    expect(sanitized[0].suggestedCategoryName).toBe("Health");
  });

  it("calculates unitPrice when only totalPrice and quantity are given", () => {
    const raw = [
      {
        name: "Eggs crate",
        quantity: 2,
        totalPrice: 8000,
      },
    ];

    const sanitized = sanitizeReceiptItems(raw, sampleCategories);
    expect(sanitized[0].unitPrice).toBe("4000.00");
    expect(sanitized[0].totalPrice).toBe("8000.00");
  });

  it("calculates totalPrice when only unitPrice and quantity are given", () => {
    const raw = [
      {
        name: "Bread",
        quantity: 3,
        unitPrice: 1200,
      },
    ];

    const sanitized = sanitizeReceiptItems(raw, sampleCategories);
    expect(sanitized[0].unitPrice).toBe("1200.00");
    expect(sanitized[0].totalPrice).toBe("3600.00");
  });
});

describe("parseReceiptResponse", () => {
  it("parses valid receipt AI output accurately", () => {
    const aiOutput = JSON.stringify({
      merchant: "Hubmart Victoria Island",
      date: "2026-10-10",
      total: "12,500.00",
      items: [
        {
          name: "Apple 1kg",
          quantity: 1,
          unitPrice: 3500,
          totalPrice: 3500,
          suggestedCategoryId: "11111111-1111-1111-1111-111111111111",
        },
        {
          name: "Bottled Water Pack",
          quantity: 2,
          unitPrice: 4500,
          totalPrice: 9000,
          suggestedCategoryId: "11111111-1111-1111-1111-111111111111",
        },
      ],
    });

    const parsed = parseReceiptResponse(aiOutput, sampleCategories);
    expect(parsed.merchant).toBe("Hubmart Victoria Island");
    expect(parsed.date).toBe("2026-10-10");
    expect(parsed.total).toBe("12500.00");
    expect(parsed.currency).toBe("NGN");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].name).toBe("Apple 1kg");
    expect(parsed.items[1].totalPrice).toBe("9000.00");
  });

  it("handles null or missing fields gracefully", () => {
    const aiOutput = JSON.stringify({
      merchant: null,
      date: "invalid-date",
      total: null,
      items: [],
    });

    const parsed = parseReceiptResponse(aiOutput, sampleCategories);
    expect(parsed.merchant).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.total).toBeNull();
    expect(parsed.items).toEqual([]);
  });
});

describe("schemas validation", () => {
  it("validates receipt scan request schema", () => {
    const valid = receiptScanSchema.safeParse({
      imageBase64: "aGVsbG8gd29ybGQ=",
      mimeType: "image/jpeg",
    });
    expect(valid.success).toBe(true);

    const empty = receiptScanSchema.safeParse({
      imageBase64: "",
      mimeType: "image/jpeg",
    });
    expect(empty.success).toBe(false);
  });

  it("validates expense batch schema", () => {
    const valid = expenseBatchSchema.safeParse({
      items: [
        {
          itemName: "Bread",
          categoryId: "c394d210-9cf6-4b6e-8219-58bfa7585e1b",
          amount: "1500.00",
          spentOn: "2026-10-10",
          note: "Receipt: Spar",
        },
      ],
    });
    expect(valid.success).toBe(true);

    const empty = expenseBatchSchema.safeParse({ items: [] });
    expect(empty.success).toBe(false);
  });
});
