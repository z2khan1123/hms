-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married', 'widowed', 'separated', 'not_specified');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'closed', 'moved_to_ipd');

-- CreateEnum
CREATE TYPE "OpdVisitStatus" AS ENUM ('waiting', 'in_consultation', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'cheque', 'bank_transfer', 'card', 'online', 'other');

-- CreateEnum
CREATE TYPE "ChargeTypeKind" AS ENUM ('opd', 'ipd', 'appointment', 'pathology', 'radiology', 'pharmacy', 'blood_bank', 'ambulance', 'operations', 'investigations', 'procedures', 'supplies', 'other');

-- CreateEnum
CREATE TYPE "VitalFlag" AS ENUM ('low', 'normal', 'high');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('platform_admin', 'hospital_admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'pharmacist', 'pathologist', 'radiologist', 'read_only');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'read_only';
COMMIT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "knownAllergies" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "tpaId" UUID,
ADD COLUMN     "tpaMemberId" TEXT,
ADD COLUMN     "tpaValidTill" DATE;

-- AlterTable
ALTER TABLE "Practitioner" ADD COLUMN     "department" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "casePrefix" TEXT NOT NULL DEFAULT 'CASE',
ADD COLUMN     "caseSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN     "opdPrefix" TEXT NOT NULL DEFAULT 'OPD',
ADD COLUMN     "opdSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "receiptPrefix" TEXT NOT NULL DEFAULT 'RCPT',
ADD COLUMN     "receiptSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi';

-- CreateTable
CREATE TABLE "Tpa" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "contactPersonName" TEXT,
    "contactPersonPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tpa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "caseNo" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "isCasualty" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "tpaId" UUID,
    "tpaMemberId" TEXT,
    "tpaValidTill" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "chargeType" "ChargeTypeKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitType" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "chargeCategoryId" UUID NOT NULL,
    "unitTypeId" UUID,
    "taxCategoryId" UUID,
    "name" TEXT NOT NULL,
    "standardChargeMinor" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomType" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymptomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Symptom" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "symptomTypeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Symptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Icd10Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Icd10Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Icd10Code" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Icd10Code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpdVisit" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "practitionerId" UUID NOT NULL,
    "appointmentId" UUID,
    "opdNo" TEXT NOT NULL,
    "visitAt" TIMESTAMP(3) NOT NULL,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "isAntenatal" BOOLEAN NOT NULL DEFAULT false,
    "isLiveConsult" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "note" TEXT,
    "previousMedicalIssue" TEXT,
    "knownAllergies" TEXT,
    "status" "OpdVisitStatus" NOT NULL DEFAULT 'waiting',
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpdVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSymptom" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "opdVisitId" UUID NOT NULL,
    "symptomId" UUID,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitSymptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitFinding" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "opdVisitId" UUID NOT NULL,
    "findingId" UUID,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitDiagnosis" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "opdVisitId" UUID NOT NULL,
    "icd10CodeId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalType" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VitalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalReading" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "caseId" UUID,
    "opdVisitId" UUID,
    "vitalTypeId" UUID NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "flag" "VitalFlag",
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID,

    CONSTRAINT "VitalReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "opdVisitId" UUID,
    "chargeId" UUID,
    "chargeName" TEXT NOT NULL,
    "chargeType" "ChargeTypeKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "standardChargeMinor" INTEGER NOT NULL,
    "appliedChargeMinor" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxBps" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL,
    "note" TEXT,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'cash',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "chequeNo" TEXT,
    "chequeDate" DATE,
    "documentUrl" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tpa_tenantId_idx" ON "Tpa"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tpa_tenantId_name_key" ON "Tpa"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Case_tenantId_patientId_openedAt_idx" ON "Case"("tenantId", "patientId", "openedAt");

-- CreateIndex
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Case_tenantId_caseNo_key" ON "Case"("tenantId", "caseNo");

-- CreateIndex
CREATE INDEX "ChargeCategory_tenantId_chargeType_idx" ON "ChargeCategory"("tenantId", "chargeType");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeCategory_tenantId_name_chargeType_key" ON "ChargeCategory"("tenantId", "name", "chargeType");

-- CreateIndex
CREATE UNIQUE INDEX "UnitType_tenantId_name_key" ON "UnitType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_tenantId_name_key" ON "TaxCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Charge_tenantId_chargeCategoryId_idx" ON "Charge"("tenantId", "chargeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_tenantId_name_chargeCategoryId_key" ON "Charge"("tenantId", "name", "chargeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomType_tenantId_name_key" ON "SymptomType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Symptom_tenantId_idx" ON "Symptom"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Symptom_tenantId_symptomTypeId_title_key" ON "Symptom"("tenantId", "symptomTypeId", "title");

-- CreateIndex
CREATE INDEX "Finding_tenantId_category_idx" ON "Finding"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_tenantId_title_key" ON "Finding"("tenantId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Icd10Group_name_key" ON "Icd10Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Icd10Code_code_key" ON "Icd10Code"("code");

-- CreateIndex
CREATE INDEX "Icd10Code_groupId_idx" ON "Icd10Code"("groupId");

-- CreateIndex
CREATE INDEX "Icd10Code_title_idx" ON "Icd10Code"("title");

-- CreateIndex
CREATE UNIQUE INDEX "OpdVisit_appointmentId_key" ON "OpdVisit"("appointmentId");

-- CreateIndex
CREATE INDEX "OpdVisit_tenantId_visitAt_idx" ON "OpdVisit"("tenantId", "visitAt");

-- CreateIndex
CREATE INDEX "OpdVisit_tenantId_practitionerId_visitAt_idx" ON "OpdVisit"("tenantId", "practitionerId", "visitAt");

-- CreateIndex
CREATE INDEX "OpdVisit_tenantId_caseId_idx" ON "OpdVisit"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "OpdVisit_tenantId_status_idx" ON "OpdVisit"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpdVisit_tenantId_opdNo_key" ON "OpdVisit"("tenantId", "opdNo");

-- CreateIndex
CREATE INDEX "VisitSymptom_tenantId_opdVisitId_idx" ON "VisitSymptom"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "VisitFinding_tenantId_opdVisitId_idx" ON "VisitFinding"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "VisitDiagnosis_tenantId_opdVisitId_idx" ON "VisitDiagnosis"("tenantId", "opdVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitDiagnosis_opdVisitId_icd10CodeId_key" ON "VisitDiagnosis"("opdVisitId", "icd10CodeId");

-- CreateIndex
CREATE UNIQUE INDEX "VitalType_tenantId_name_key" ON "VitalType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "VitalReading_tenantId_patientId_recordedAt_idx" ON "VitalReading"("tenantId", "patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "VitalReading_tenantId_opdVisitId_idx" ON "VitalReading"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "ChargeItem_tenantId_caseId_idx" ON "ChargeItem"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "ChargeItem_tenantId_opdVisitId_idx" ON "ChargeItem"("tenantId", "opdVisitId");

-- CreateIndex
CREATE INDEX "ChargeItem_tenantId_chargedAt_idx" ON "ChargeItem"("tenantId", "chargedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_caseId_idx" ON "Payment"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_receiptNo_key" ON "Payment"("tenantId", "receiptNo");

-- CreateIndex
CREATE INDEX "Patient_tenantId_nationalIdHash_idx" ON "Patient"("tenantId", "nationalIdHash");

-- AddForeignKey
ALTER TABLE "Tpa" ADD CONSTRAINT "Tpa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tpaId_fkey" FOREIGN KEY ("tpaId") REFERENCES "Tpa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tpaId_fkey" FOREIGN KEY ("tpaId") REFERENCES "Tpa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeCategory" ADD CONSTRAINT "ChargeCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitType" ADD CONSTRAINT "UnitType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCategory" ADD CONSTRAINT "TaxCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_chargeCategoryId_fkey" FOREIGN KEY ("chargeCategoryId") REFERENCES "ChargeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomType" ADD CONSTRAINT "SymptomType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symptom" ADD CONSTRAINT "Symptom_symptomTypeId_fkey" FOREIGN KEY ("symptomTypeId") REFERENCES "SymptomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Icd10Code" ADD CONSTRAINT "Icd10Code_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Icd10Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSymptom" ADD CONSTRAINT "VisitSymptom_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSymptom" ADD CONSTRAINT "VisitSymptom_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "Symptom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitFinding" ADD CONSTRAINT "VisitFinding_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitFinding" ADD CONSTRAINT "VisitFinding_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitDiagnosis" ADD CONSTRAINT "VisitDiagnosis_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitDiagnosis" ADD CONSTRAINT "VisitDiagnosis_icd10CodeId_fkey" FOREIGN KEY ("icd10CodeId") REFERENCES "Icd10Code"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalType" ADD CONSTRAINT "VitalType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_vitalTypeId_fkey" FOREIGN KEY ("vitalTypeId") REFERENCES "VitalType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_opdVisitId_fkey" FOREIGN KEY ("opdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

