-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sale_ends_at" TIMESTAMP(3),
ADD COLUMN     "sale_price" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "products_sale_price_idx" ON "products"("sale_price");
