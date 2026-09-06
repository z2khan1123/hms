-- CreateEnum
CREATE TYPE "BedBlockReason" AS ENUM ('cleaning', 'maintenance', 'reserved', 'other');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('admitted', 'discharged', 'cancelled');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "admissionPrefix" TEXT NOT NULL DEFAULT 'IPD',
ADD COLUMN     "admissionSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VitalReading" ADD COLUMN     "admissionId" UUID;

-- CreateTable
CREATE TABLE "Floor" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedType" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultNightlyRateMinor" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BedType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "floorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "bedTypeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" "BedBlockReason",
    "blockNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "admissionNo" TEXT NOT NULL,
    "fromOpdVisitId" UUID,
    "practitionerId" UUID NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'admitted',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "provisionalDiagnosis" TEXT,
    "admissionNote" TEXT,
    "dischargeSummary" TEXT,
    "dischargeAdvice" TEXT,
    "dischargedById" UUID,
    "revertedAt" TIMESTAMP(3),
    "revertReason" TEXT,
    "admittedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedAssignment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "admissionId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toAt" TIMESTAMP(3),
    "moveReason" TEXT,
    "assignedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurseNote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "admissionId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NurseNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Floor_tenantId_name_key" ON "Floor"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BedType_tenantId_name_key" ON "BedType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Ward_tenantId_floorId_idx" ON "Ward"("tenantId", "floorId");

-- CreateIndex
CREATE UNIQUE INDEX "Ward_tenantId_name_key" ON "Ward"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Bed_tenantId_wardId_idx" ON "Bed"("tenantId", "wardId");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_tenantId_name_key" ON "Bed"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_fromOpdVisitId_key" ON "Admission"("fromOpdVisitId");

-- CreateIndex
CREATE INDEX "Admission_tenantId_status_idx" ON "Admission"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Admission_tenantId_patientId_admittedAt_idx" ON "Admission"("tenantId", "patientId", "admittedAt");

-- CreateIndex
CREATE INDEX "Admission_tenantId_caseId_idx" ON "Admission"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_tenantId_admissionNo_key" ON "Admission"("tenantId", "admissionNo");

-- CreateIndex
CREATE INDEX "BedAssignment_tenantId_admissionId_idx" ON "BedAssignment"("tenantId", "admissionId");

-- CreateIndex
CREATE INDEX "BedAssignment_tenantId_bedId_toAt_idx" ON "BedAssignment"("tenantId", "bedId", "toAt");

-- CreateIndex
CREATE INDEX "NurseNote_tenantId_admissionId_recordedAt_idx" ON "NurseNote"("tenantId", "admissionId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedType" ADD CONSTRAINT "BedType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_bedTypeId_fkey" FOREIGN KEY ("bedTypeId") REFERENCES "BedType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_fromOpdVisitId_fkey" FOREIGN KEY ("fromOpdVisitId") REFERENCES "OpdVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurseNote" ADD CONSTRAINT "NurseNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurseNote" ADD CONSTRAINT "NurseNote_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalReading" ADD CONSTRAINT "VitalReading_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

