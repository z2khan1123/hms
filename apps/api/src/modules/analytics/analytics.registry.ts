import {
  ATTENDANCE_STATUS_LABELS,
  BILL_ITEM_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  PAYROLL_STATUS_LABELS,
  SERVICE_DEPARTMENT_LABELS,
  type Dataset,
  type FieldKind,
  type Permission,
} from '@hms/shared';

/**
 * The dataset registry — the whole security boundary of the analytics layer.
 *
 * A client query names a dataset and its fields by KEY. Nothing else it sends
 * ever reaches SQL. Every table name, column expression and join in the system
 * is written here, by hand, once; the query builder looks keys up in this map
 * and refuses anything absent. That is what makes a structured query engine
 * safe where a "just let them write SQL" reporting tool is not — the client
 * cannot name a table it was not given, cannot reach another tenant's rows,
 * and has no string that lands in a query unescaped.
 *
 * Two invariants hold for every dataset:
 *
 *  1. `tenantColumn` is injected into the WHERE clause by the builder, from the
 *     signed-in user's token. It is never accepted from the request.
 *  2. `requires` is checked before the query is built, and it is the DATASET's
 *     own permission — `analytics:read` grants the screen, never the data.
 */

interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  role: 'dimension' | 'measure';
  /** SQL expression, always written here — never assembled from user input. */
  sql: string;
  options?: { value: string; label: string }[];
}

export interface DatasetDef {
  id: string;
  label: string;
  description: string;
  requires: Permission;
  /** `FROM ... JOIN ...`, fixed per dataset. */
  from: string;
  /** Qualified `tenantId` column the builder always filters on. */
  tenantColumn: string;
  /** Extra always-on predicate, e.g. excluding soft-deleted rows. */
  baseWhere?: string;
  dateField: string | null;
  fields: FieldDef[];
}

const labelsToOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];

export const DATASETS: DatasetDef[] = [
  {
    id: 'patients',
    label: 'Patients',
    description: 'Everyone registered, with their demographics.',
    requires: 'patient:read',
    from: '"Patient" p',
    tenantColumn: 'p."tenantId"',
    baseWhere: 'p."deletedAt" IS NULL',
    dateField: 'registeredAt',
    fields: [
      { key: 'id', label: 'Patient', kind: 'string', role: 'measure', sql: 'p."id"' },
      { key: 'mrn', label: 'MRN', kind: 'string', role: 'dimension', sql: 'p."mrn"' },
      { key: 'gender', label: 'Gender', kind: 'enum', role: 'dimension', sql: 'p."gender"::text', options: GENDER_OPTIONS },
      { key: 'bloodType', label: 'Blood group', kind: 'string', role: 'dimension', sql: 'p."bloodType"' },
      { key: 'city', label: 'City', kind: 'string', role: 'dimension', sql: `p."address"->>'city'` },
      { key: 'status', label: 'Status', kind: 'string', role: 'dimension', sql: 'p."status"::text' },
      { key: 'birthDate', label: 'Date of birth', kind: 'date', role: 'dimension', sql: 'p."birthDate"' },
      {
        key: 'ageYears',
        label: 'Age in years',
        kind: 'number',
        role: 'measure',
        sql: 'EXTRACT(YEAR FROM AGE(p."birthDate"))',
      },
      { key: 'registeredAt', label: 'Registered', kind: 'datetime', role: 'dimension', sql: 'p."createdAt"' },
    ],
  },

  {
    id: 'opd_visits',
    label: 'OPD visits',
    description: 'Outpatient consultations, by doctor and day.',
    requires: 'opd:read',
    from:
      '"OpdVisit" v ' +
      'LEFT JOIN "Practitioner" pr ON pr."id" = v."practitionerId" ' +
      'LEFT JOIN "Patient" p ON p."id" = v."patientId"',
    tenantColumn: 'v."tenantId"',
    dateField: 'visitedAt',
    fields: [
      { key: 'id', label: 'Visit', kind: 'string', role: 'measure', sql: 'v."id"' },
      { key: 'opdNo', label: 'Visit no.', kind: 'string', role: 'dimension', sql: 'v."opdNo"' },
      { key: 'status', label: 'Status', kind: 'string', role: 'dimension', sql: 'v."status"::text' },
      {
        key: 'doctor',
        label: 'Doctor',
        kind: 'string',
        role: 'dimension',
        sql: `COALESCE(pr."firstName" || ' ' || pr."lastName", '—')`,
      },
      { key: 'patientMrn', label: 'Patient MRN', kind: 'string', role: 'dimension', sql: 'p."mrn"' },
      { key: 'gender', label: 'Patient gender', kind: 'enum', role: 'dimension', sql: 'p."gender"::text', options: GENDER_OPTIONS },
      { key: 'city', label: 'Patient city', kind: 'string', role: 'dimension', sql: `p."address"->>'city'` },
      { key: 'isFollowUp', label: 'Follow-up', kind: 'boolean', role: 'dimension', sql: 'v."isFollowUp"' },
      { key: 'visitedAt', label: 'Visited', kind: 'datetime', role: 'dimension', sql: 'v."visitAt"' },
    ],
  },

  {
    id: 'bill_items',
    label: 'Charges',
    description: 'Everything billed, by service and status. Revenue as charged.',
    requires: 'bill:read',
    // `department` and `serviceName` are snapshotted onto the bill line, so
    // renaming a service never rewrites what a patient was charged for — and
    // this dataset needs no join to read them.
    from:
      '"BillItem" b ' +
      'LEFT JOIN "Case" c ON c."id" = b."caseId" ' +
      'LEFT JOIN "Patient" p ON p."id" = c."patientId"',
    tenantColumn: 'b."tenantId"',
    dateField: 'chargedAt',
    fields: [
      { key: 'id', label: 'Charge', kind: 'string', role: 'measure', sql: 'b."id"' },
      { key: 'serviceName', label: 'Item', kind: 'string', role: 'dimension', sql: 'b."serviceName"' },
      {
        key: 'status',
        label: 'Status',
        kind: 'enum',
        role: 'dimension',
        sql: 'b."status"::text',
        options: labelsToOptions(BILL_ITEM_STATUS_LABELS),
      },
      {
        key: 'department',
        label: 'Department',
        kind: 'enum',
        role: 'dimension',
        sql: 'b."department"::text',
        options: labelsToOptions(SERVICE_DEPARTMENT_LABELS),
      },
      { key: 'patientMrn', label: 'Patient MRN', kind: 'string', role: 'dimension', sql: 'p."mrn"' },
      { key: 'chargedAt', label: 'Charged', kind: 'datetime', role: 'dimension', sql: 'b."chargedAt"' },
      { key: 'quantity', label: 'Quantity', kind: 'number', role: 'measure', sql: 'b."quantity"' },
      {
        key: 'grossMinor',
        label: 'Gross',
        kind: 'money',
        role: 'measure',
        // There is no stored gross — it is price x quantity, exactly as
        // `computeBillLine` defines it in the shared contract.
        sql: 'b."priceMinor" * b."quantity"',
      },
      { key: 'discountMinor', label: 'Discount', kind: 'money', role: 'measure', sql: 'b."discountMinor"' },
      { key: 'netMinor', label: 'Net', kind: 'money', role: 'measure', sql: 'b."netMinor"' },
    ],
  },

  {
    id: 'payments',
    label: 'Payments',
    description: 'Money actually collected, by mode and day.',
    requires: 'payment:read',
    from:
      '"Payment" pm ' +
      'LEFT JOIN "Case" c ON c."id" = pm."caseId" ' +
      'LEFT JOIN "Patient" p ON p."id" = c."patientId"',
    tenantColumn: 'pm."tenantId"',
    dateField: 'receivedAt',
    fields: [
      { key: 'id', label: 'Payment', kind: 'string', role: 'measure', sql: 'pm."id"' },
      { key: 'receiptNo', label: 'Receipt no.', kind: 'string', role: 'dimension', sql: 'pm."receiptNo"' },
      {
        key: 'mode',
        label: 'Mode',
        kind: 'enum',
        role: 'dimension',
        sql: 'pm."mode"::text',
        options: labelsToOptions(PAYMENT_MODE_LABELS),
      },
      { key: 'patientMrn', label: 'Patient MRN', kind: 'string', role: 'dimension', sql: 'p."mrn"' },
      { key: 'receivedAt', label: 'Received', kind: 'datetime', role: 'dimension', sql: 'pm."createdAt"' },
      { key: 'amountMinor', label: 'Amount', kind: 'money', role: 'measure', sql: 'pm."amountMinor"' },
    ],
  },

  {
    id: 'service_orders',
    label: 'Orders',
    description: 'Lab, imaging and procedure orders, and how far they got.',
    requires: 'order:read',
    from:
      '"ServiceOrder" o ' +
      'LEFT JOIN "Service" s ON s."id" = o."serviceId" ' +
      'LEFT JOIN "Practitioner" pr ON pr."id" = o."orderedById"',
    tenantColumn: 'o."tenantId"',
    dateField: 'orderedAt',
    fields: [
      { key: 'id', label: 'Order', kind: 'string', role: 'measure', sql: 'o."id"' },
      { key: 'status', label: 'Status', kind: 'string', role: 'dimension', sql: 'o."status"::text' },
      { key: 'service', label: 'Service', kind: 'string', role: 'dimension', sql: 's."name"' },
      {
        key: 'department',
        label: 'Department',
        kind: 'enum',
        role: 'dimension',
        sql: 's."department"::text',
        options: labelsToOptions(SERVICE_DEPARTMENT_LABELS),
      },
      {
        key: 'orderedBy',
        label: 'Ordered by',
        kind: 'string',
        role: 'dimension',
        sql: `COALESCE(pr."firstName" || ' ' || pr."lastName", '—')`,
      },
      { key: 'orderedAt', label: 'Ordered', kind: 'datetime', role: 'dimension', sql: 'o."createdAt"' },
      {
        key: 'hoursToComplete',
        label: 'Hours to complete',
        kind: 'number',
        role: 'measure',
        sql: 'EXTRACT(EPOCH FROM (o."completedAt" - o."createdAt")) / 3600.0',
      },
    ],
  },

  {
    id: 'admissions',
    label: 'Admissions',
    description: 'Inpatient stays, by ward and length of stay.',
    requires: 'admission:read',
    from:
      '"Admission" a ' +
      'LEFT JOIN "Patient" p ON p."id" = a."patientId"',
    tenantColumn: 'a."tenantId"',
    dateField: 'admittedAt',
    fields: [
      { key: 'id', label: 'Admission', kind: 'string', role: 'measure', sql: 'a."id"' },
      { key: 'admissionNo', label: 'Admission no.', kind: 'string', role: 'dimension', sql: 'a."admissionNo"' },
      { key: 'status', label: 'Status', kind: 'string', role: 'dimension', sql: 'a."status"::text' },
      { key: 'patientMrn', label: 'Patient MRN', kind: 'string', role: 'dimension', sql: 'p."mrn"' },
      { key: 'gender', label: 'Patient gender', kind: 'enum', role: 'dimension', sql: 'p."gender"::text', options: GENDER_OPTIONS },
      { key: 'admittedAt', label: 'Admitted', kind: 'datetime', role: 'dimension', sql: 'a."admittedAt"' },
      { key: 'dischargedAt', label: 'Discharged', kind: 'datetime', role: 'dimension', sql: 'a."dischargedAt"' },
      {
        key: 'nights',
        label: 'Nights stayed',
        kind: 'number',
        role: 'measure',
        sql: 'GREATEST(0, DATE_PART(\'day\', COALESCE(a."dischargedAt", NOW()) - a."admittedAt"))',
      },
    ],
  },

  {
    id: 'dispenses',
    label: 'Medicines dispensed',
    description: 'What left the pharmacy counter, by medicine.',
    requires: 'dispense:read',
    from:
      '"DispenseItem" di ' +
      'JOIN "Dispense" d ON d."id" = di."dispenseId" ' +
      'LEFT JOIN "Medicine" m ON m."id" = di."medicineId"',
    tenantColumn: 'di."tenantId"',
    dateField: 'dispensedAt',
    fields: [
      { key: 'id', label: 'Line', kind: 'string', role: 'measure', sql: 'di."id"' },
      { key: 'medicine', label: 'Medicine', kind: 'string', role: 'dimension', sql: 'm."name"' },
      { key: 'genericName', label: 'Generic name', kind: 'string', role: 'dimension', sql: 'm."genericName"' },
      { key: 'company', label: 'Company', kind: 'string', role: 'dimension', sql: 'm."company"' },
      { key: 'dispensedAt', label: 'Dispensed', kind: 'datetime', role: 'dimension', sql: 'd."dispensedAt"' },
      { key: 'quantity', label: 'Quantity', kind: 'number', role: 'measure', sql: 'di."quantity"' },
      { key: 'lineTotalMinor', label: 'Line total', kind: 'money', role: 'measure', sql: 'di."lineTotalMinor"' },
    ],
  },

  {
    id: 'stock_moves',
    label: 'Stock movements',
    description: 'General inventory in and out, by item and store.',
    requires: 'inventory:read',
    from:
      '"StockMove" sm ' +
      'LEFT JOIN "InventoryItem" ii ON ii."id" = sm."itemId" ' +
      'LEFT JOIN "Store" st ON st."id" = sm."storeId" ' +
      'LEFT JOIN "ItemCategory" ic ON ic."id" = ii."categoryId"',
    tenantColumn: 'sm."tenantId"',
    dateField: 'movedAt',
    fields: [
      { key: 'id', label: 'Movement', kind: 'string', role: 'measure', sql: 'sm."id"' },
      { key: 'item', label: 'Item', kind: 'string', role: 'dimension', sql: 'ii."name"' },
      { key: 'category', label: 'Category', kind: 'string', role: 'dimension', sql: 'ic."name"' },
      { key: 'store', label: 'Store', kind: 'string', role: 'dimension', sql: 'st."name"' },
      { key: 'kind', label: 'Kind', kind: 'string', role: 'dimension', sql: 'sm."kind"::text' },
      { key: 'movedAt', label: 'Moved', kind: 'datetime', role: 'dimension', sql: 'sm."createdAt"' },
      {
        key: 'signedQuantity',
        label: 'Signed quantity',
        kind: 'number',
        role: 'measure',
        sql: `CASE sm."kind" WHEN 'receipt' THEN sm."quantity" WHEN 'issue' THEN -sm."quantity" ELSE sm."quantity" END`,
      },
    ],
  },

  {
    id: 'income',
    label: 'Income ledger',
    description: 'Income entries by head.',
    requires: 'finance:read',
    from: '"Income" i LEFT JOIN "IncomeHead" ih ON ih."id" = i."headId"',
    tenantColumn: 'i."tenantId"',
    dateField: 'receivedAt',
    fields: [
      { key: 'id', label: 'Entry', kind: 'string', role: 'measure', sql: 'i."id"' },
      { key: 'head', label: 'Head', kind: 'string', role: 'dimension', sql: 'ih."name"' },
      { key: 'receivedAt', label: 'Date', kind: 'datetime', role: 'dimension', sql: 'i."receivedAt"' },
      { key: 'amountMinor', label: 'Amount', kind: 'money', role: 'measure', sql: 'i."amountMinor"' },
    ],
  },

  {
    id: 'expenses',
    label: 'Expense ledger',
    description: 'Expense entries by head.',
    requires: 'finance:read',
    from: '"Expense" e LEFT JOIN "ExpenseHead" eh ON eh."id" = e."headId"',
    tenantColumn: 'e."tenantId"',
    dateField: 'paidAt',
    fields: [
      { key: 'id', label: 'Entry', kind: 'string', role: 'measure', sql: 'e."id"' },
      { key: 'head', label: 'Head', kind: 'string', role: 'dimension', sql: 'eh."name"' },
      { key: 'paidAt', label: 'Date', kind: 'datetime', role: 'dimension', sql: 'e."paidAt"' },
      { key: 'amountMinor', label: 'Amount', kind: 'money', role: 'measure', sql: 'e."amountMinor"' },
    ],
  },

  {
    id: 'staff',
    label: 'Staff',
    description: 'The employment roll, by department and designation.',
    requires: 'staff:read',
    from:
      '"StaffProfile" sp ' +
      'JOIN "User" u ON u."id" = sp."userId" ' +
      'LEFT JOIN "Department" dp ON dp."id" = sp."departmentId" ' +
      'LEFT JOIN "Designation" dg ON dg."id" = sp."designationId"',
    tenantColumn: 'sp."tenantId"',
    dateField: 'joinedOn',
    fields: [
      { key: 'id', label: 'Staff member', kind: 'string', role: 'measure', sql: 'sp."id"' },
      { key: 'staffNo', label: 'Staff no.', kind: 'string', role: 'dimension', sql: 'sp."staffNo"' },
      { key: 'department', label: 'Department', kind: 'string', role: 'dimension', sql: 'dp."name"' },
      { key: 'designation', label: 'Designation', kind: 'string', role: 'dimension', sql: 'dg."name"' },
      { key: 'role', label: 'Role', kind: 'string', role: 'dimension', sql: 'u."role"::text' },
      { key: 'isActive', label: 'Currently employed', kind: 'boolean', role: 'dimension', sql: 'sp."isActive"' },
      { key: 'joinedOn', label: 'Joined', kind: 'date', role: 'dimension', sql: 'sp."joinedOn"' },
      { key: 'basicSalaryMinor', label: 'Basic pay', kind: 'money', role: 'measure', sql: 'sp."basicSalaryMinor"' },
    ],
  },

  {
    id: 'attendance',
    label: 'Attendance',
    description: 'Who was in, by day and department.',
    requires: 'attendance:read',
    from:
      '"StaffAttendance" at ' +
      'JOIN "StaffProfile" sp ON sp."id" = at."staffId" ' +
      'LEFT JOIN "Department" dp ON dp."id" = sp."departmentId"',
    tenantColumn: 'at."tenantId"',
    dateField: 'onDate',
    fields: [
      { key: 'id', label: 'Record', kind: 'string', role: 'measure', sql: 'at."id"' },
      { key: 'staffNo', label: 'Staff no.', kind: 'string', role: 'dimension', sql: 'sp."staffNo"' },
      { key: 'department', label: 'Department', kind: 'string', role: 'dimension', sql: 'dp."name"' },
      {
        key: 'status',
        label: 'Status',
        kind: 'enum',
        role: 'dimension',
        sql: 'at."status"::text',
        options: labelsToOptions(ATTENDANCE_STATUS_LABELS),
      },
      { key: 'onDate', label: 'Date', kind: 'date', role: 'dimension', sql: 'at."onDate"' },
    ],
  },

  {
    id: 'leave_requests',
    label: 'Leave',
    description: 'Leave taken and requested, by type and status.',
    requires: 'leave:read',
    from:
      '"LeaveRequest" lr ' +
      'JOIN "StaffProfile" sp ON sp."id" = lr."staffId" ' +
      'LEFT JOIN "LeaveType" lt ON lt."id" = lr."leaveTypeId" ' +
      'LEFT JOIN "Department" dp ON dp."id" = sp."departmentId"',
    tenantColumn: 'lr."tenantId"',
    dateField: 'fromDate',
    fields: [
      { key: 'id', label: 'Request', kind: 'string', role: 'measure', sql: 'lr."id"' },
      { key: 'staffNo', label: 'Staff no.', kind: 'string', role: 'dimension', sql: 'sp."staffNo"' },
      { key: 'department', label: 'Department', kind: 'string', role: 'dimension', sql: 'dp."name"' },
      { key: 'leaveType', label: 'Leave type', kind: 'string', role: 'dimension', sql: 'lt."name"' },
      {
        key: 'status',
        label: 'Status',
        kind: 'enum',
        role: 'dimension',
        sql: 'lr."status"::text',
        options: labelsToOptions(LEAVE_STATUS_LABELS),
      },
      { key: 'fromDate', label: 'From', kind: 'date', role: 'dimension', sql: 'lr."fromDate"' },
      { key: 'days', label: 'Days', kind: 'number', role: 'measure', sql: 'lr."days"' },
    ],
  },

  {
    id: 'payslips',
    label: 'Payroll',
    description: 'What was paid, by month and department.',
    requires: 'payroll:read',
    from:
      '"Payslip" ps ' +
      'JOIN "PayrollRun" pr2 ON pr2."id" = ps."runId" ' +
      'LEFT JOIN "StaffProfile" sp ON sp."id" = ps."staffId" ' +
      'LEFT JOIN "Department" dp ON dp."id" = sp."departmentId"',
    tenantColumn: 'ps."tenantId"',
    dateField: 'periodStart',
    fields: [
      { key: 'id', label: 'Payslip', kind: 'string', role: 'measure', sql: 'ps."id"' },
      { key: 'staffNo', label: 'Staff no.', kind: 'string', role: 'dimension', sql: 'ps."staffNoSnapshot"' },
      { key: 'designation', label: 'Designation', kind: 'string', role: 'dimension', sql: 'ps."designationSnapshot"' },
      { key: 'department', label: 'Department', kind: 'string', role: 'dimension', sql: 'dp."name"' },
      {
        key: 'runStatus',
        label: 'Run status',
        kind: 'enum',
        role: 'dimension',
        sql: 'pr2."status"::text',
        options: labelsToOptions(PAYROLL_STATUS_LABELS),
      },
      {
        key: 'periodStart',
        label: 'Month',
        kind: 'date',
        role: 'dimension',
        sql: 'MAKE_DATE(pr2."year", pr2."month", 1)',
      },
      { key: 'basicMinor', label: 'Basic', kind: 'money', role: 'measure', sql: 'ps."basicMinor"' },
      { key: 'earningsMinor', label: 'Earnings', kind: 'money', role: 'measure', sql: 'ps."earningsMinor"' },
      { key: 'deductionsMinor', label: 'Deductions', kind: 'money', role: 'measure', sql: 'ps."deductionsMinor"' },
      { key: 'netMinor', label: 'Net pay', kind: 'money', role: 'measure', sql: 'ps."netMinor"' },
    ],
  },
];

const BY_ID = new Map(DATASETS.map((d) => [d.id, d]));

export function findDataset(id: string): DatasetDef | undefined {
  return BY_ID.get(id);
}

/** The client-facing shape: everything except the SQL, which never leaves here. */
export function toDatasetDto(d: DatasetDef): Dataset {
  return {
    id: d.id,
    label: d.label,
    description: d.description,
    requires: d.requires,
    dateField: d.dateField,
    fields: d.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      role: f.role,
      ...(f.options ? { options: f.options } : {}),
    })),
  };
}
