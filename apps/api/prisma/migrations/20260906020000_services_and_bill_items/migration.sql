-- CreateEnum
CREATE TYPE "ServiceDepartment" AS ENUM ('opd', 'procedure', 'laboratory', 'radiology', 'pharmacy', 'inpatient', 'ambulance', 'other');

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_chargeCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_taxCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_unitTypeId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeCategory" DROP CONSTRAINT "ChargeCategory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeItem" DROP CONSTRAINT "ChargeItem_caseId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeItem" DROP CONSTRAINT "ChargeItem_chargeId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeItem" DROP CONSTRAINT "ChargeItem_opdVisitId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeItem" DROP CONSTRAINT "ChargeItem_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TaxCategory" DROP CONSTRAINT "TaxCategory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UnitType" DROP CONSTRAINT "UnitType_tenantId_fkey";

-- DropTable
DROP TABLE "Charge";

-- DropTable
DROP TABLE "ChargeCategory";

-- DropTable
DROP TABLE "ChargeItem";

-- DropTable
DROP TABLE "TaxCategory";

-- DropTable
DROP TABLE "UnitType";

-- DropEnum
DROP TYPE "ChargeTypeKind";

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department" "ServiceDepartment",
    "defaultPriceMinor" INTEGER,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "opdVisitId" UUID,
    "serviceId" UUID,
    "serviceName" TEXT NOT NULL,
    "department" "ServiceDepartment",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "defaultPriceMinor" INTEGER,
    "priceMinor" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL,
    "note" TEXT,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_tenantId_department_idx" ON "Service"("tenantId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name");

-- CreateIndex
CREATE INDEX "BillItem_tenantId_caseId_idx" ON "BillItem"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "BillItem_tenantId_opdVisitId_idx" ON "BillItem"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "BillItem_tenantId_chargedAt_idx" ON "BillItem"("tenantId", "chargedAt");

-- CreateIndex
CREATE INDEX "BillItem_tenantId_department_idx" ON "BillItem"("tenantId", "department");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

