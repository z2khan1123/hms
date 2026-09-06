-- CreateEnum
CREATE TYPE "BillItemStatus" AS ENUM ('pending', 'paid', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('ordered', 'in_progress', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "OpdVisitStatus" ADD VALUE 'registered';

-- AlterTable
ALTER TABLE "BillItem" ADD COLUMN     "approvalReason" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "approvedWithoutPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "paymentId" UUID,
ADD COLUMN     "status" "BillItemStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Practitioner" ADD COLUMN     "consultationFeeMinor" INTEGER;

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "opdVisitId" UUID,
    "serviceId" UUID,
    "serviceName" TEXT NOT NULL,
    "department" "ServiceDepartment",
    "billItemId" UUID,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'ordered',
    "note" TEXT,
    "orderedById" UUID,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "startedById" UUID,
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "opdVisitId" UUID NOT NULL,
    "drugName" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_billItemId_key" ON "ServiceOrder"("billItemId");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_status_idx" ON "ServiceOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_department_status_idx" ON "ServiceOrder"("tenantId", "department", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_patientId_orderedAt_idx" ON "ServiceOrder"("tenantId", "patientId", "orderedAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenantId_opdVisitId_idx" ON "ServiceOrder"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_tenantId_opdVisitId_idx" ON "PrescriptionItem"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "BillItem_tenantId_status_idx" ON "BillItem"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

