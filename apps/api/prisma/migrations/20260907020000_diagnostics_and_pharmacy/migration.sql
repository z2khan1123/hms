-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('mild', 'moderate', 'severe');

-- AlterEnum
ALTER TYPE "ServiceOrderStatus" ADD VALUE 'sample_collected';

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "medicineId" UUID;

-- CreateTable
CREATE TABLE "LabTest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "serviceId" UUID,
    "name" TEXT NOT NULL,
    "department" "ServiceDepartment" NOT NULL,
    "sampleType" TEXT,
    "method" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestParameter" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "labTestId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticReport" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "serviceOrderId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "labTestId" UUID,
    "department" "ServiceDepartment" NOT NULL,
    "sampleCollectedAt" TIMESTAMP(3),
    "sampleCollectedById" UUID,
    "findings" TEXT,
    "impression" TEXT,
    "comments" TEXT,
    "reportedAt" TIMESTAMP(3),
    "reportedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticValue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "parameterId" UUID,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "flag" "VitalFlag",
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "categoryId" UUID,
    "company" TEXT,
    "strength" TEXT,
    "unit" TEXT,
    "reorderLevel" INTEGER,
    "allergenKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineBatch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "purchasePriceMinor" INTEGER,
    "salePriceMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicinePurchase" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicinePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicinePurchaseItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchasePriceMinor" INTEGER NOT NULL,
    "salePriceMinor" INTEGER,
    "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicinePurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispense" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "opdVisitId" UUID,
    "admissionId" UUID,
    "billItemId" UUID,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "dispenseId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "medicineName" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAllergy" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'moderate',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_serviceId_key" ON "LabTest"("serviceId");

-- CreateIndex
CREATE INDEX "LabTest_tenantId_department_idx" ON "LabTest"("tenantId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_tenantId_name_key" ON "LabTest"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LabTestParameter_tenantId_labTestId_idx" ON "LabTestParameter"("tenantId", "labTestId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTestParameter_labTestId_name_key" ON "LabTestParameter"("labTestId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticReport_serviceOrderId_key" ON "DiagnosticReport"("serviceOrderId");

-- CreateIndex
CREATE INDEX "DiagnosticReport_tenantId_patientId_createdAt_idx" ON "DiagnosticReport"("tenantId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticReport_tenantId_department_idx" ON "DiagnosticReport"("tenantId", "department");

-- CreateIndex
CREATE INDEX "DiagnosticReport_tenantId_caseId_idx" ON "DiagnosticReport"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "DiagnosticValue_tenantId_reportId_idx" ON "DiagnosticValue"("tenantId", "reportId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineCategory_tenantId_name_key" ON "MedicineCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_genericName_idx" ON "Medicine"("tenantId", "genericName");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_categoryId_idx" ON "Medicine"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_tenantId_name_strength_key" ON "Medicine"("tenantId", "name", "strength");

-- CreateIndex
CREATE INDEX "MedicineBatch_tenantId_expiryDate_idx" ON "MedicineBatch"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "MedicineBatch_tenantId_medicineId_idx" ON "MedicineBatch"("tenantId", "medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineBatch_tenantId_medicineId_batchNo_key" ON "MedicineBatch"("tenantId", "medicineId", "batchNo");

-- CreateIndex
CREATE INDEX "MedicinePurchase_tenantId_purchasedAt_idx" ON "MedicinePurchase"("tenantId", "purchasedAt");

-- CreateIndex
CREATE INDEX "MedicinePurchaseItem_tenantId_purchaseId_idx" ON "MedicinePurchaseItem"("tenantId", "purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispense_billItemId_key" ON "Dispense"("billItemId");

-- CreateIndex
CREATE INDEX "Dispense_tenantId_patientId_dispensedAt_idx" ON "Dispense"("tenantId", "patientId", "dispensedAt");

-- CreateIndex
CREATE INDEX "Dispense_tenantId_caseId_idx" ON "Dispense"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "DispenseItem_tenantId_dispenseId_idx" ON "DispenseItem"("tenantId", "dispenseId");

-- CreateIndex
CREATE INDEX "PatientAllergy_tenantId_patientId_idx" ON "PatientAllergy"("tenantId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAllergy_tenantId_patientId_substance_key" ON "PatientAllergy"("tenantId", "patientId", "substance");

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticValue" ADD CONSTRAINT "DiagnosticValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticValue" ADD CONSTRAINT "DiagnosticValue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DiagnosticReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticValue" ADD CONSTRAINT "DiagnosticValue_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "LabTestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineCategory" ADD CONSTRAINT "MedicineCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MedicineCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBatch" ADD CONSTRAINT "MedicineBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBatch" ADD CONSTRAINT "MedicineBatch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePurchase" ADD CONSTRAINT "MedicinePurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePurchaseItem" ADD CONSTRAINT "MedicinePurchaseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePurchaseItem" ADD CONSTRAINT "MedicinePurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "MedicinePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePurchaseItem" ADD CONSTRAINT "MedicinePurchaseItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_dispenseId_fkey" FOREIGN KEY ("dispenseId") REFERENCES "Dispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MedicineBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

