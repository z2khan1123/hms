-- Row-Level Security.
--
-- Every policy below is FAIL CLOSED: `current_setting(..., true)` returns
-- NULL when the setting is absent, and `tenantId = NULL` is never true, so a
-- connection that has not declared a tenant sees nothing at all. That is the
-- behaviour we want — a forgotten `SET` must produce an empty result, never a
-- full table.
--
-- FORCE is required because the application connects as the table owner, and
-- Postgres exempts the owner from RLS unless forced.
--
-- Deliberately NOT under RLS, each for a stated reason:
--   User: read by email at login, before any tenant is known.
--   ApiKey: read by key prefix before any tenant is known.
--   PatientAccount: read by MRN at portal login, before any tenant is known.
--   WebhookEndpoint: read cross-tenant by the delivery dispatcher.
--   WebhookDelivery: read cross-tenant by the delivery dispatcher.
--   AuditEvent: written for pre-tenant events such as a failed login.

ALTER TABLE "Tpa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tpa" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Tpa";
CREATE POLICY tenant_isolation ON "Tpa"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Patient" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Patient";
CREATE POLICY tenant_isolation ON "Patient"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Practitioner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Practitioner" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Practitioner";
CREATE POLICY tenant_isolation ON "Practitioner"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Appointment";
CREATE POLICY tenant_isolation ON "Appointment"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Case" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Case";
CREATE POLICY tenant_isolation ON "Case"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Service";
CREATE POLICY tenant_isolation ON "Service"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "SymptomType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SymptomType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SymptomType";
CREATE POLICY tenant_isolation ON "SymptomType"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Symptom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Symptom" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Symptom";
CREATE POLICY tenant_isolation ON "Symptom"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Finding";
CREATE POLICY tenant_isolation ON "Finding"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "OpdVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpdVisit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OpdVisit";
CREATE POLICY tenant_isolation ON "OpdVisit"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VisitSymptom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitSymptom" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VisitSymptom";
CREATE POLICY tenant_isolation ON "VisitSymptom"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VisitFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitFinding" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VisitFinding";
CREATE POLICY tenant_isolation ON "VisitFinding"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VisitDiagnosis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitDiagnosis" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VisitDiagnosis";
CREATE POLICY tenant_isolation ON "VisitDiagnosis"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "ServiceOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServiceOrder";
CREATE POLICY tenant_isolation ON "ServiceOrder"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PrescriptionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrescriptionItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PrescriptionItem";
CREATE POLICY tenant_isolation ON "PrescriptionItem"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Floor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Floor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Floor";
CREATE POLICY tenant_isolation ON "Floor"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BedType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BedType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BedType";
CREATE POLICY tenant_isolation ON "BedType"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Ward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ward" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Ward";
CREATE POLICY tenant_isolation ON "Ward"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Bed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bed" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Bed";
CREATE POLICY tenant_isolation ON "Bed"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Admission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Admission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Admission";
CREATE POLICY tenant_isolation ON "Admission"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BedAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BedAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BedAssignment";
CREATE POLICY tenant_isolation ON "BedAssignment"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "NurseNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NurseNote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NurseNote";
CREATE POLICY tenant_isolation ON "NurseNote"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "LabTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabTest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LabTest";
CREATE POLICY tenant_isolation ON "LabTest"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "LabTestParameter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabTestParameter" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LabTestParameter";
CREATE POLICY tenant_isolation ON "LabTestParameter"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "DiagnosticReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiagnosticReport" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DiagnosticReport";
CREATE POLICY tenant_isolation ON "DiagnosticReport"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "DiagnosticValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiagnosticValue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DiagnosticValue";
CREATE POLICY tenant_isolation ON "DiagnosticValue"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "MedicineCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicineCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MedicineCategory";
CREATE POLICY tenant_isolation ON "MedicineCategory"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Medicine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Medicine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Medicine";
CREATE POLICY tenant_isolation ON "Medicine"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "MedicineBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicineBatch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MedicineBatch";
CREATE POLICY tenant_isolation ON "MedicineBatch"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "MedicinePurchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicinePurchase" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MedicinePurchase";
CREATE POLICY tenant_isolation ON "MedicinePurchase"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "MedicinePurchaseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MedicinePurchaseItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MedicinePurchaseItem";
CREATE POLICY tenant_isolation ON "MedicinePurchaseItem"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Dispense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dispense" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Dispense";
CREATE POLICY tenant_isolation ON "Dispense"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "DispenseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DispenseItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DispenseItem";
CREATE POLICY tenant_isolation ON "DispenseItem"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PatientAllergy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientAllergy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PatientAllergy";
CREATE POLICY tenant_isolation ON "PatientAllergy"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "IncomeHead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncomeHead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IncomeHead";
CREATE POLICY tenant_isolation ON "IncomeHead"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Income" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Income" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Income";
CREATE POLICY tenant_isolation ON "Income"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "ExpenseHead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseHead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ExpenseHead";
CREATE POLICY tenant_isolation ON "ExpenseHead"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Expense";
CREATE POLICY tenant_isolation ON "Expense"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Referrer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referrer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Referrer";
CREATE POLICY tenant_isolation ON "Referrer"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "ReferralPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReferralPayment";
CREATE POLICY tenant_isolation ON "ReferralPayment"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "ItemCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ItemCategory";
CREATE POLICY tenant_isolation ON "ItemCategory"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Store";
CREATE POLICY tenant_isolation ON "Store"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "InventoryItem";
CREATE POLICY tenant_isolation ON "InventoryItem"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "StockMove" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMove" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockMove";
CREATE POLICY tenant_isolation ON "StockMove"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Department";
CREATE POLICY tenant_isolation ON "Department"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Designation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Designation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Designation";
CREATE POLICY tenant_isolation ON "Designation"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "StaffProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffProfile";
CREATE POLICY tenant_isolation ON "StaffProfile"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "StaffAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAttendance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffAttendance";
CREATE POLICY tenant_isolation ON "StaffAttendance"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LeaveType";
CREATE POLICY tenant_isolation ON "LeaveType"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LeaveRequest";
CREATE POLICY tenant_isolation ON "LeaveRequest"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Shift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shift" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Shift";
CREATE POLICY tenant_isolation ON "Shift"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "RosterEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RosterEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RosterEntry";
CREATE POLICY tenant_isolation ON "RosterEntry"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PayrollRun";
CREATE POLICY tenant_isolation ON "PayrollRun"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Payslip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payslip" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Payslip";
CREATE POLICY tenant_isolation ON "Payslip"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PayslipLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayslipLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PayslipLine";
CREATE POLICY tenant_isolation ON "PayslipLine"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VitalType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VitalType" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VitalType";
CREATE POLICY tenant_isolation ON "VitalType"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VitalReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VitalReading" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VitalReading";
CREATE POLICY tenant_isolation ON "VitalReading"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BillItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BillItem";
CREATE POLICY tenant_isolation ON "BillItem"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Payment";
CREATE POLICY tenant_isolation ON "Payment"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SavedView";
CREATE POLICY tenant_isolation ON "SavedView"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Donor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Donor" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Donor";
CREATE POLICY tenant_isolation ON "Donor"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BloodUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BloodUnit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BloodUnit";
CREATE POLICY tenant_isolation ON "BloodUnit"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BloodIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BloodIssue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BloodIssue";
CREATE POLICY tenant_isolation ON "BloodIssue"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Vehicle";
CREATE POLICY tenant_isolation ON "Vehicle"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "AmbulanceCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AmbulanceCall" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AmbulanceCall";
CREATE POLICY tenant_isolation ON "AmbulanceCall"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "BirthRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BirthRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BirthRecord";
CREATE POLICY tenant_isolation ON "BirthRecord"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "DeathRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeathRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeathRecord";
CREATE POLICY tenant_isolation ON "DeathRecord"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "VisitorLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisitorLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VisitorLog";
CREATE POLICY tenant_isolation ON "VisitorLog"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PhoneCallLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneCallLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PhoneCallLog";
CREATE POLICY tenant_isolation ON "PhoneCallLog"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "PostalLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostalLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PostalLog";
CREATE POLICY tenant_isolation ON "PostalLog"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "Complaint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Complaint" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Complaint";
CREATE POLICY tenant_isolation ON "Complaint"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "AppointmentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AppointmentRequest";
CREATE POLICY tenant_isolation ON "AppointmentRequest"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);
