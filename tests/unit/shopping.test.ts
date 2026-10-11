import { describe, expect, it } from "vitest";
import {
  shoppingImportSchema,
  shoppingItemCreateSchema,
  shoppingItemUpdateSchema,
} from "@/schemas";
import { updatePriceFields } from "@/lib/money";

describe("shopping schemas", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000";

  it("validates valid shopping item creation", () => {
    const input = {
      itemName: "Bag of Rice",
      categoryId: validUuid,
      quantity: "2",
      unitPrice: "40000",
      amount: "80000",
    };
    const result = shoppingItemCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itemName).toBe("Bag of Rice");
      expect(result.data.quantity).toBe("2");
      expect(result.data.unitPrice).toBe("40000.00");
      expect(result.data.amount).toBe("80000.00");
    }
  });

  it("rejects empty item name or zero amount", () => {
    const emptyName = shoppingItemCreateSchema.safeParse({
      itemName: "",
      categoryId: validUuid,
      amount: "5000",
    });
    expect(emptyName.success).toBe(false);

    const zeroAmount = shoppingItemCreateSchema.safeParse({
      itemName: "Beans",
      categoryId: validUuid,
      amount: "0",
    });
    expect(zeroAmount.success).toBe(false);
  });

  it("validates shopping item update", () => {
    const update = {
      itemName: "Fresh Fish",
      amount: "15000",
      purchased: true,
    };
    const result = shoppingItemUpdateSchema.safeParse(update);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itemName).toBe("Fresh Fish");
      expect(result.data.amount).toBe("15000.00");
      expect(result.data.purchased).toBe(true);
    }
  });

  it("validates import schema", () => {
    expect(shoppingImportSchema.safeParse({ month: "2026-09" }).success).toBe(true);
    expect(shoppingImportSchema.safeParse({ month: "invalid-month" }).success).toBe(false);
    expect(shoppingImportSchema.safeParse({}).success).toBe(true);
  });
});

describe("shopping price calculations", () => {
  it("calculates total from unit price and quantity", () => {
    const state = updatePriceFields(
      { quantity: "3", unitPrice: "", amount: "" },
      { unitPrice: "2500" },
    );
    expect(state.amount).toBe("7500.00");
    expect(state.unitPrice).toBe("2500");
  });

  it("calculates unit price from total and quantity", () => {
    const state = updatePriceFields(
      { quantity: "4", unitPrice: "", amount: "" },
      { amount: "10000" },
    );
    expect(state.unitPrice).toBe("2500.00");
    expect(state.amount).toBe("10000");
  });

  it("recalculates total when quantity increases", () => {
    const initial = updatePriceFields(
      { quantity: "2", unitPrice: "", amount: "" },
      { unitPrice: "5000" },
    );
    expect(initial.amount).toBe("10000.00");

    const updated = updatePriceFields(initial, { quantity: "3" });
    expect(updated.amount).toBe("15000.00");
  });
});
