import {
  type ChargeTypeKind,
  PrismaClient,
  type Prisma,
  type Role,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO = {
  tenantName: 'Demo Hospital',
  slug: 'demo-hospital',
  currency: 'PKR',
  mrnPrefix: 'DMO',
  casePrefix: 'DMO-CASE',
  opdPrefix: 'DMO-OPD',
  receiptPrefix: 'DMO-RCPT',
  adminEmail: 'admin@demo-hospital.test',
  adminPassword: 'ChangeMe123!demo',
  staffPassword: 'ChangeMe123!demo',
};

async function main(): Promise<void> {
  const tenant =
    (await prisma.tenant.findUnique({ where: { slug: DEMO.slug } })) ??
    (await prisma.tenant.create({
      data: {
        name: DEMO.tenantName,
        slug: DEMO.slug,
        mrnPrefix: DEMO.mrnPrefix,
      },
    }));

  // Currency and the human-facing document-number prefixes. Safe to re-apply.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      currency: DEMO.currency,
      mrnPrefix: DEMO.mrnPrefix,
      casePrefix: DEMO.casePrefix,
      opdPrefix: DEMO.opdPrefix,
      receiptPrefix: DEMO.receiptPrefix,
    },
  });
  const tenantId = tenant.id;

  await seedUsers(tenantId);
  await seedPractitioners(tenantId);
  await seedPatients(tenantId);
  await seedTpas(tenantId);
  await seedTaxCategories(tenantId);
  await seedUnitTypes(tenantId);
  await seedChargeMaster(tenantId);
  await seedClinicalVocabulary(tenantId);
  await seedIcd10();
  await seedVitalTypes(tenantId);

  console.log('\nSeed complete.');
  console.log('  Tenant:   %s (%s)', DEMO.tenantName, tenantId);
  console.log('  Login:    %s', DEMO.adminEmail);
  console.log('  Password: %s', DEMO.adminPassword);
  console.log(
    '  Staff:    doctor@ / receptionist@ / accountant@ / nurse@demo-hospital.test',
  );
  console.log('            all with password: %s', DEMO.staffPassword);
  console.log('  ^ change these before deploying anywhere real.\n');
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

async function ensureUser(
  tenantId: string,
  email: string,
  firstName: string,
  lastName: string,
  role: Role,
  password: string,
): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    // Keep the role in step with the current RBAC matrix.
    if (existing.role !== role) {
      await prisma.user.update({ where: { id: existing.id }, data: { role } });
    }
    return;
  }
  await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      firstName,
      lastName,
      role,
    },
  });
}

async function seedUsers(tenantId: string): Promise<void> {
  await ensureUser(
    tenantId,
    DEMO.adminEmail,
    'Demo',
    'Admin',
    'hospital_admin',
    DEMO.adminPassword,
  );
  await ensureUser(
    tenantId,
    'doctor@demo-hospital.test',
    'Ayesha',
    'Khan',
    'doctor',
    DEMO.staffPassword,
  );
  await ensureUser(
    tenantId,
    'receptionist@demo-hospital.test',
    'Hina',
    'Sheikh',
    'receptionist',
    DEMO.staffPassword,
  );
  await ensureUser(
    tenantId,
    'accountant@demo-hospital.test',
    'Kamran',
    'Iqbal',
    'accountant',
    DEMO.staffPassword,
  );
  await ensureUser(
    tenantId,
    'nurse@demo-hospital.test',
    'Rabia',
    'Noor',
    'nurse',
    DEMO.staffPassword,
  );
}

async function seedPractitioners(tenantId: string): Promise<void> {
  if ((await prisma.practitioner.count({ where: { tenantId } })) > 0) return;
  await prisma.practitioner.createMany({
    data: [
      { tenantId, firstName: 'Ayesha', lastName: 'Khan', specialty: 'General Medicine' },
      { tenantId, firstName: 'Bilal', lastName: 'Ahmed', specialty: 'Pediatrics' },
      { tenantId, firstName: 'Sana', lastName: 'Malik', specialty: 'Cardiology' },
    ],
  });
}

async function seedPatients(tenantId: string): Promise<void> {
  if ((await prisma.patient.count({ where: { tenantId } })) > 0) return;
  await prisma.patient.createMany({
    data: [
      {
        tenantId,
        mrn: `${DEMO.mrnPrefix}-000001`,
        firstName: 'Fatima',
        lastName: 'Riaz',
        gender: 'female',
        birthDate: new Date('1990-04-12'),
        phone: '+923001234567',
      },
      {
        tenantId,
        mrn: `${DEMO.mrnPrefix}-000002`,
        firstName: 'Usman',
        lastName: 'Tariq',
        gender: 'male',
        birthDate: new Date('1985-11-03'),
        phone: '+923219876543',
      },
    ],
  });
  await prisma.tenant.update({ where: { id: tenantId }, data: { mrnSeq: 2 } });
}

// ---------------------------------------------------------------------------
// Payers
// ---------------------------------------------------------------------------

async function seedTpas(tenantId: string): Promise<void> {
  const tpas: { name: string; code: string }[] = [
    { name: 'State Life Insurance', code: 'SLIC' },
    { name: 'Jubilee Health', code: 'JBL' },
    { name: 'Adamjee Health', code: 'ADM' },
    { name: 'EFU Health', code: 'EFU' },
    { name: 'Pak-Qatar Takaful', code: 'PQT' },
  ];
  for (const t of tpas) {
    const found = await prisma.tpa.findFirst({
      where: { tenantId, name: t.name },
    });
    if (!found) {
      await prisma.tpa.create({
        data: { tenantId, name: t.name, code: t.code },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Charge master
// ---------------------------------------------------------------------------

async function seedTaxCategories(tenantId: string): Promise<void> {
  const cats: { name: string; rateBps: number }[] = [
    { name: 'None', rateBps: 0 },
    { name: 'GST 16%', rateBps: 1600 },
    { name: 'GST 18%', rateBps: 1800 },
  ];
  for (const c of cats) {
    const found = await prisma.taxCategory.findFirst({
      where: { tenantId, name: c.name },
    });
    if (!found) {
      await prisma.taxCategory.create({
        data: { tenantId, name: c.name, rateBps: c.rateBps },
      });
    }
  }
}

async function seedUnitTypes(tenantId: string): Promise<void> {
  const names = ['per visit', 'per day', 'per hour', 'per session', 'per km'];
  for (const name of names) {
    const found = await prisma.unitType.findFirst({
      where: { tenantId, name },
    });
    if (!found) await prisma.unitType.create({ data: { tenantId, name } });
  }
}

async function ensureChargeCategory(
  tenantId: string,
  name: string,
  chargeType: ChargeTypeKind,
): Promise<string> {
  const found = await prisma.chargeCategory.findFirst({
    where: { tenantId, name, chargeType },
  });
  if (found) return found.id;
  const created = await prisma.chargeCategory.create({
    data: { tenantId, name, chargeType },
  });
  return created.id;
}

async function ensureCharge(
  tenantId: string,
  chargeCategoryId: string,
  data: {
    name: string;
    standardChargeMinor: number;
    unitTypeId: string | null;
    taxCategoryId: string | null;
  },
): Promise<void> {
  const found = await prisma.charge.findFirst({
    where: { tenantId, name: data.name, chargeCategoryId },
  });
  if (found) return;
  await prisma.charge.create({
    data: {
      tenantId,
      chargeCategoryId,
      unitTypeId: data.unitTypeId,
      taxCategoryId: data.taxCategoryId,
      name: data.name,
      standardChargeMinor: data.standardChargeMinor,
    },
  });
}

async function seedChargeMaster(tenantId: string): Promise<void> {
  const noneTax = await prisma.taxCategory.findFirst({
    where: { tenantId, name: 'None' },
  });
  const perVisit = await prisma.unitType.findFirst({
    where: { tenantId, name: 'per visit' },
  });
  const perSession = await prisma.unitType.findFirst({
    where: { tenantId, name: 'per session' },
  });

  const consultationCat = await ensureChargeCategory(
    tenantId,
    'OPD Consultation',
    'opd',
  );
  const procedureCat = await ensureChargeCategory(
    tenantId,
    'OPD Procedures',
    'opd',
  );

  // Prices are in paisa (PKR minor units): Rs 1,500 -> 150000.
  const consultations: { name: string; standardChargeMinor: number }[] = [
    { name: 'OPD Consultation Fees', standardChargeMinor: 150000 },
    { name: 'Follow-up Consultation', standardChargeMinor: 80000 },
    { name: 'Specialist Consultation', standardChargeMinor: 300000 },
  ];
  const procedures: { name: string; standardChargeMinor: number }[] = [
    { name: 'Dressing', standardChargeMinor: 50000 },
    { name: 'Injection Administration', standardChargeMinor: 30000 },
    { name: 'ECG', standardChargeMinor: 120000 },
    { name: 'Nebulisation', standardChargeMinor: 60000 },
  ];

  for (const c of consultations) {
    await ensureCharge(tenantId, consultationCat, {
      ...c,
      unitTypeId: perVisit?.id ?? null,
      taxCategoryId: noneTax?.id ?? null,
    });
  }
  for (const c of procedures) {
    await ensureCharge(tenantId, procedureCat, {
      ...c,
      unitTypeId: perSession?.id ?? null,
      taxCategoryId: noneTax?.id ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Clinical vocabulary
// ---------------------------------------------------------------------------

async function seedClinicalVocabulary(tenantId: string): Promise<void> {
  const symptomsByType: Record<string, string[]> = {
    Respiratory: ['Cough', 'Shortness of breath', 'Sore throat', 'Wheezing'],
    Gastrointestinal: ['Nausea', 'Vomiting', 'Diarrhoea', 'Abdominal pain'],
    Musculoskeletal: ['Joint pain', 'Back pain', 'Muscle stiffness'],
    Dermatological: ['Rash', 'Itching', 'Skin lesion'],
    Neurological: ['Headache', 'Dizziness', 'Numbness', 'Seizure'],
    Cardiovascular: ['Chest pain', 'Palpitations', 'Leg swelling'],
    Urological: ['Painful urination', 'Urinary frequency', 'Blood in urine'],
    General: ['Fever', 'Fatigue', 'Weight loss', 'Loss of appetite'],
  };

  for (const [typeName, titles] of Object.entries(symptomsByType)) {
    let type = await prisma.symptomType.findFirst({
      where: { tenantId, name: typeName },
    });
    type ??= await prisma.symptomType.create({
      data: { tenantId, name: typeName },
    });
    for (const title of titles) {
      const found = await prisma.symptom.findFirst({
        where: { tenantId, symptomTypeId: type.id, title },
      });
      if (!found) {
        await prisma.symptom.create({
          data: { tenantId, symptomTypeId: type.id, title },
        });
      }
    }
  }

  const findings: { title: string; category: string }[] = [
    { title: 'Fever', category: 'General' },
    { title: 'Tachycardia', category: 'Cardiovascular' },
    { title: 'Raised blood pressure', category: 'Cardiovascular' },
    { title: 'Pallor', category: 'General' },
    { title: 'Dehydration', category: 'General' },
    { title: 'Crepitations on auscultation', category: 'Respiratory' },
    { title: 'Wheeze on auscultation', category: 'Respiratory' },
    { title: 'Abdominal tenderness', category: 'Abdominal' },
    { title: 'Lymphadenopathy', category: 'General' },
    { title: 'Skin rash', category: 'Skin' },
    { title: 'Peripheral oedema', category: 'Cardiovascular' },
  ];
  for (const f of findings) {
    const found = await prisma.finding.findFirst({
      where: { tenantId, title: f.title },
    });
    if (!found) {
      await prisma.finding.create({
        data: { tenantId, title: f.title, category: f.category },
      });
    }
  }
}

async function seedIcd10(): Promise<void> {
  const groups: {
    name: string;
    codes: { code: string; title: string }[];
  }[] = [
    {
      name: 'Respiratory & Infectious',
      codes: [
        { code: 'J06.9', title: 'Acute upper respiratory infection, unspecified' },
        { code: 'J45.9', title: 'Asthma, unspecified' },
        { code: 'J20.9', title: 'Acute bronchitis, unspecified' },
        { code: 'J18.9', title: 'Pneumonia, unspecified organism' },
        { code: 'J02.9', title: 'Acute pharyngitis, unspecified' },
        { code: 'A09', title: 'Infectious gastroenteritis and colitis, unspecified' },
      ],
    },
    {
      name: 'Chronic & Cardiometabolic',
      codes: [
        { code: 'E11.9', title: 'Type 2 diabetes mellitus without complications' },
        { code: 'I10', title: 'Essential (primary) hypertension' },
        { code: 'E78.5', title: 'Hyperlipidaemia, unspecified' },
        { code: 'K21.9', title: 'Gastro-oesophageal reflux disease without oesophagitis' },
        { code: 'M54.5', title: 'Low back pain' },
        { code: 'R51', title: 'Headache' },
      ],
    },
  ];

  for (const g of groups) {
    const group =
      (await prisma.icd10Group.findUnique({ where: { name: g.name } })) ??
      (await prisma.icd10Group.create({ data: { name: g.name } }));
    for (const c of g.codes) {
      const found = await prisma.icd10Code.findUnique({
        where: { code: c.code },
      });
      if (!found) {
        await prisma.icd10Code.create({
          data: { groupId: group.id, code: c.code, title: c.title },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

async function seedVitalTypes(tenantId: string): Promise<void> {
  const types: Prisma.VitalTypeCreateManyInput[] = [
    { tenantId, name: 'Height', unit: 'cm' },
    { tenantId, name: 'Weight', unit: 'kg' },
    { tenantId, name: 'Pulse', unit: 'bpm', refLow: 60, refHigh: 100 },
    { tenantId, name: 'Temperature', unit: '°F', refLow: 97, refHigh: 99 },
    { tenantId, name: 'BP Systolic', unit: 'mmHg', refLow: 90, refHigh: 120 },
  ];
  for (const t of types) {
    const found = await prisma.vitalType.findFirst({
      where: { tenantId, name: t.name },
    });
    if (!found) await prisma.vitalType.create({ data: t });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
