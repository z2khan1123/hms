-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('normal', 'caesarean', 'assisted', 'other');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('incoming', 'outgoing');

-- CreateEnum
CREATE TYPE "PostalDirection" AS ENUM ('received', 'dispatched');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "ComplaintSeverity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "birthPrefix" TEXT NOT NULL DEFAULT 'BIR',
ADD COLUMN     "birthSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complaintPrefix" TEXT NOT NULL DEFAULT 'CMP',
ADD COLUMN     "complaintSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deathPrefix" TEXT NOT NULL DEFAULT 'DTH',
ADD COLUMN     "deathSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visitorPrefix" TEXT NOT NULL DEFAULT 'VIS',
ADD COLUMN     "visitorSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BirthRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "childName" TEXT,
    "gender" "Gender" NOT NULL,
    "bornAt" TIMESTAMP(3) NOT NULL,
    "birthWeightGrams" INTEGER,
    "deliveryType" "DeliveryType" NOT NULL,
    "motherPatientId" UUID,
    "motherName" TEXT,
    "motherCnicHash" TEXT,
    "motherCnicLast4" TEXT,
    "fatherName" TEXT,
    "fatherCnicHash" TEXT,
    "fatherCnicLast4" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "attendedById" UUID,
    "childPatientId" UUID,
    "note" TEXT,
    "registrationNo" TEXT,
    "registeredOn" DATE,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeathRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "diedAt" TIMESTAMP(3) NOT NULL,
    "causeOfDeath" TEXT NOT NULL,
    "placeOfDeath" TEXT,
    "certifiedById" UUID,
    "informantName" TEXT,
    "informantPhone" TEXT,
    "informantRelation" TEXT,
    "note" TEXT,
    "registrationNo" TEXT,
    "registeredOn" DATE,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeathRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "passNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "patientId" UUID,
    "visitingWhom" TEXT,
    "purpose" TEXT,
    "idCardLast4" TEXT,
    "numberOfVisitors" INTEGER NOT NULL DEFAULT 1,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneCallLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "callerName" TEXT NOT NULL,
    "phone" TEXT,
    "patientId" UUID,
    "purpose" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMinutes" INTEGER,
    "outcome" TEXT,
    "followUpOn" DATE,
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostalLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "direction" "PostalDirection" NOT NULL,
    "party" TEXT NOT NULL,
    "addressedTo" TEXT,
    "reference" TEXT,
    "courier" TEXT,
    "trackingNo" TEXT,
    "onDate" DATE NOT NULL,
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "complainantName" TEXT NOT NULL,
    "phone" TEXT,
    "patientId" UUID,
    "about" TEXT,
    "severity" "ComplaintSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'open',
    "assignedToId" UUID,
    "resolution" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BirthRecord_tenantId_bornAt_idx" ON "BirthRecord"("tenantId", "bornAt");

-- CreateIndex
CREATE INDEX "BirthRecord_tenantId_registrationNo_idx" ON "BirthRecord"("tenantId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "BirthRecord_tenantId_certificateNo_key" ON "BirthRecord"("tenantId", "certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "DeathRecord_patientId_key" ON "DeathRecord"("patientId");

-- CreateIndex
CREATE INDEX "DeathRecord_tenantId_diedAt_idx" ON "DeathRecord"("tenantId", "diedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeathRecord_tenantId_certificateNo_key" ON "DeathRecord"("tenantId", "certificateNo");

-- CreateIndex
CREATE INDEX "VisitorLog_tenantId_arrivedAt_idx" ON "VisitorLog"("tenantId", "arrivedAt");

-- CreateIndex
CREATE INDEX "VisitorLog_tenantId_leftAt_idx" ON "VisitorLog"("tenantId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorLog_tenantId_passNo_key" ON "VisitorLog"("tenantId", "passNo");

-- CreateIndex
CREATE INDEX "PhoneCallLog_tenantId_calledAt_idx" ON "PhoneCallLog"("tenantId", "calledAt");

-- CreateIndex
CREATE INDEX "PhoneCallLog_tenantId_followUpOn_idx" ON "PhoneCallLog"("tenantId", "followUpOn");

-- CreateIndex
CREATE INDEX "PostalLog_tenantId_onDate_idx" ON "PostalLog"("tenantId", "onDate");

-- CreateIndex
CREATE INDEX "PostalLog_tenantId_direction_idx" ON "PostalLog"("tenantId", "direction");

-- CreateIndex
CREATE INDEX "Complaint_tenantId_status_idx" ON "Complaint"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Complaint_tenantId_receivedAt_idx" ON "Complaint"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_tenantId_reference_key" ON "Complaint"("tenantId", "reference");

-- AddForeignKey
ALTER TABLE "BirthRecord" ADD CONSTRAINT "BirthRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthRecord" ADD CONSTRAINT "BirthRecord_motherPatientId_fkey" FOREIGN KEY ("motherPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthRecord" ADD CONSTRAINT "BirthRecord_attendedById_fkey" FOREIGN KEY ("attendedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthRecord" ADD CONSTRAINT "BirthRecord_childPatientId_fkey" FOREIGN KEY ("childPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeathRecord" ADD CONSTRAINT "DeathRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeathRecord" ADD CONSTRAINT "DeathRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeathRecord" ADD CONSTRAINT "DeathRecord_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorLog" ADD CONSTRAINT "VisitorLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorLog" ADD CONSTRAINT "VisitorLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCallLog" ADD CONSTRAINT "PhoneCallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCallLog" ADD CONSTRAINT "PhoneCallLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostalLog" ADD CONSTRAINT "PostalLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

