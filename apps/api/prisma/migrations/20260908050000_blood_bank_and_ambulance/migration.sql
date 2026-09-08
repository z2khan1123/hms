-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

-- CreateEnum
CREATE TYPE "BloodComponent" AS ENUM ('whole_blood', 'packed_red_cells', 'plasma', 'platelets', 'cryoprecipitate');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('basic', 'advanced_life_support', 'patient_transport', 'mortuary');

-- CreateEnum
CREATE TYPE "EmergencyLevel" AS ENUM ('critical', 'urgent', 'routine');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "callPrefix" TEXT NOT NULL DEFAULT 'AMB',
ADD COLUMN     "callSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "donorPrefix" TEXT NOT NULL DEFAULT 'DNR',
ADD COLUMN     "donorSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Donor" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "donorNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "phone" TEXT NOT NULL,
    "birthDate" DATE,
    "address" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodUnit" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bagNo" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "component" "BloodComponent" NOT NULL,
    "donorId" UUID,
    "collectedOn" DATE NOT NULL,
    "expiresOn" DATE NOT NULL,
    "volumeMl" INTEGER,
    "screenedAt" TIMESTAMP(3),
    "screeningPassed" BOOLEAN,
    "issuedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "discardReason" TEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodIssue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "recipientGroup" "BloodGroup" NOT NULL,
    "crossMatchedBy" TEXT,
    "billItemId" UUID,
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "BloodIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "model" TEXT,
    "type" "VehicleType" NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "baseChargeMinor" INTEGER,
    "perKmChargeMinor" INTEGER,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbulanceCall" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "callNo" TEXT NOT NULL,
    "vehicleId" UUID NOT NULL,
    "patientId" UUID,
    "caseId" UUID,
    "callerName" TEXT,
    "callerPhone" TEXT,
    "emergencyLevel" "EmergencyLevel" NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "dropAddress" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "chargeMinor" INTEGER,
    "billItemId" UUID,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbulanceCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Donor_tenantId_bloodGroup_idx" ON "Donor"("tenantId", "bloodGroup");

-- CreateIndex
CREATE INDEX "Donor_tenantId_phone_idx" ON "Donor"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_tenantId_donorNo_key" ON "Donor"("tenantId", "donorNo");

-- CreateIndex
CREATE INDEX "BloodUnit_tenantId_bloodGroup_component_idx" ON "BloodUnit"("tenantId", "bloodGroup", "component");

-- CreateIndex
CREATE INDEX "BloodUnit_tenantId_expiresOn_idx" ON "BloodUnit"("tenantId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "BloodUnit_tenantId_bagNo_key" ON "BloodUnit"("tenantId", "bagNo");

-- CreateIndex
CREATE UNIQUE INDEX "BloodIssue_unitId_key" ON "BloodIssue"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "BloodIssue_billItemId_key" ON "BloodIssue"("billItemId");

-- CreateIndex
CREATE INDEX "BloodIssue_tenantId_patientId_idx" ON "BloodIssue"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "BloodIssue_tenantId_issuedAt_idx" ON "BloodIssue"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_type_idx" ON "Vehicle"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_registrationNo_key" ON "Vehicle"("tenantId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceCall_billItemId_key" ON "AmbulanceCall"("billItemId");

-- CreateIndex
CREATE INDEX "AmbulanceCall_tenantId_dispatchedAt_idx" ON "AmbulanceCall"("tenantId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "AmbulanceCall_tenantId_vehicleId_idx" ON "AmbulanceCall"("tenantId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceCall_tenantId_callNo_key" ON "AmbulanceCall"("tenantId", "callNo");

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodUnit" ADD CONSTRAINT "BloodUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodUnit" ADD CONSTRAINT "BloodUnit_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodIssue" ADD CONSTRAINT "BloodIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodIssue" ADD CONSTRAINT "BloodIssue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "BloodUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodIssue" ADD CONSTRAINT "BloodIssue_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodIssue" ADD CONSTRAINT "BloodIssue_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodIssue" ADD CONSTRAINT "BloodIssue_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceCall" ADD CONSTRAINT "AmbulanceCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceCall" ADD CONSTRAINT "AmbulanceCall_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceCall" ADD CONSTRAINT "AmbulanceCall_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceCall" ADD CONSTRAINT "AmbulanceCall_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceCall" ADD CONSTRAINT "AmbulanceCall_billItemId_fkey" FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

