-- CreateTable
CREATE TABLE "shopping_items" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '1',
    "unit_price" DECIMAL(14,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "category_id" UUID NOT NULL,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "purchased_at" TIMESTAMPTZ,
    "expense_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_items_account_id_purchased_idx" ON "shopping_items"("account_id", "purchased");

-- CreateIndex
CREATE INDEX "shopping_items_account_id_created_at_idx" ON "shopping_items"("account_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
