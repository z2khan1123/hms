-- CreateEnum
CREATE TYPE "CustomEntity" AS ENUM ('patient', 'opd_visit', 'admission', 'appointment', 'staff', 'donor', 'ambulance_call');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'textarea', 'number', 'date', 'boolean', 'select');

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entity" "CustomEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "helpText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "entity" "CustomEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "value" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_entity_isActive_idx" ON "CustomFieldDefinition"("tenantId", "entity", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entity_key_key" ON "CustomFieldDefinition"("tenantId", "entity", "key");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_entity_entityId_idx" ON "CustomFieldValue"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_definitionId_entityId_key" ON "CustomFieldValue"("definitionId", "entityId");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- New tenant-scoped tables join Row-Level Security in the same migration that
-- creates them, so there is never a window in which they exist unprotected.
-- See docs/row-level-security.md.
ALTER TABLE "CustomFieldDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomFieldDefinition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomFieldDefinition";
CREATE POLICY tenant_isolation ON "CustomFieldDefinition"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "CustomFieldValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomFieldValue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CustomFieldValue";
CREATE POLICY tenant_isolation ON "CustomFieldValue"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);
