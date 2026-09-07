import {
  PrismaClient,
  type Prisma,
  type Role,
  type ServiceDepartment,
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
  await seedServices(tenantId);
  await seedClinicalVocabulary(tenantId);
  await seedIcd10();
  await seedVitalTypes(tenantId);
  await seedDiagnostics(tenantId);
  await seedWardsAndBeds(tenantId);

  console.log('\nSeed complete.');
  console.log('  Tenant:   %s (%s)', DEMO.tenantName, tenantId);
  console.log('  Login:    %s', DEMO.adminEmail);
  console.log('  Password: %s', DEMO.adminPassword);
  console.log(
    '  Staff:    doctor@ / receptionist@ / accountant@ / nurse@ /',
  );
  console.log('            pathologist@ / radiologist@demo-hospital.test');
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
  // Department staff — without these nobody can open the lab/imaging worklist.
  await ensureUser(
    tenantId,
    'pathologist@demo-hospital.test',
    'Imran',
    'Bhatti',
    'pathologist',
    DEMO.staffPassword,
  );
  await ensureUser(
    tenantId,
    'radiologist@demo-hospital.test',
    'Nadia',
    'Farooq',
    'radiologist',
    DEMO.staffPassword,
  );
}

async function seedPractitioners(tenantId: string): Promise<void> {
  const practitioners: {
    firstName: string;
    lastName: string;
    specialty: string;
    consultationFeeMinor: number;
  }[] = [
    {
      firstName: 'Ayesha',
      lastName: 'Khan',
      specialty: 'General Medicine',
      consultationFeeMinor: 150000,
    },
    {
      firstName: 'Bilal',
      lastName: 'Ahmed',
      specialty: 'Pediatrics',
      consultationFeeMinor: 200000,
    },
    {
      firstName: 'Sana',
      lastName: 'Malik',
      specialty: 'Cardiology',
      consultationFeeMinor: 300000,
    },
  ];
  for (const p of practitioners) {
    const found = await prisma.practitioner.findFirst({
      where: { tenantId, firstName: p.firstName, lastName: p.lastName },
    });
    if (found) {
      await prisma.practitioner.update({
        where: { id: found.id },
        data: { consultationFeeMinor: p.consultationFeeMinor },
      });
    } else {
      await prisma.practitioner.create({ data: { tenantId, ...p } });
    }
  }
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
// Services — a flat list whose only job is to keep the NAME consistent for
// reporting. `defaultPriceMinor` is a suggestion; the price billed is entered
// on the patient's record. Prices are in paisa (PKR minor units): Rs 1,500 -> 150000.
// ---------------------------------------------------------------------------

async function seedServices(tenantId: string): Promise<void> {
  const services: {
    name: string;
    department: ServiceDepartment;
    defaultPriceMinor: number;
  }[] = [
    { name: 'OPD Consultation', department: 'opd', defaultPriceMinor: 150000 },
    { name: 'Follow-up Consultation', department: 'opd', defaultPriceMinor: 80000 },
    { name: 'Specialist Consultation', department: 'opd', defaultPriceMinor: 300000 },
    { name: 'Dressing', department: 'procedure', defaultPriceMinor: 50000 },
    { name: 'Injection Administration', department: 'procedure', defaultPriceMinor: 30000 },
    { name: 'Nebulisation', department: 'procedure', defaultPriceMinor: 60000 },
    { name: 'ECG', department: 'procedure', defaultPriceMinor: 120000 },
    { name: 'Stitch Removal', department: 'procedure', defaultPriceMinor: 40000 },
    // Lab and imaging — so a doctor's order has something to reference.
    { name: 'CBC', department: 'laboratory', defaultPriceMinor: 80000 },
    { name: 'Blood Sugar Fasting', department: 'laboratory', defaultPriceMinor: 40000 },
    { name: 'Urine R/E', department: 'laboratory', defaultPriceMinor: 35000 },
    { name: 'LFT', department: 'laboratory', defaultPriceMinor: 150000 },
    { name: 'Chest X-Ray', department: 'radiology', defaultPriceMinor: 120000 },
    { name: 'Ultrasound Abdomen', department: 'radiology', defaultPriceMinor: 250000 },
  ];
  for (const s of services) {
    const found = await prisma.service.findFirst({
      where: { tenantId, name: s.name },
    });
    if (!found) {
      await prisma.service.create({
        data: {
          tenantId,
          name: s.name,
          department: s.department,
          defaultPriceMinor: s.defaultPriceMinor,
        },
      });
    }
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

// ---------------------------------------------------------------------------
// Diagnostics — a real definition for each seeded lab/imaging service so a
// report can actually be filled in. Pathology tests carry parameters with
// reference ranges; imaging carries none and is reported as narrative findings.
// Each test is linked to the existing Service of the same name.
// ---------------------------------------------------------------------------

interface SeedParam {
  name: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
}

interface SeedLabTest {
  name: string;
  department: ServiceDepartment;
  sampleType?: string;
  parameters: SeedParam[];
}

async function seedDiagnostics(tenantId: string): Promise<void> {
  const tests: SeedLabTest[] = [
    {
      name: 'CBC',
      department: 'laboratory',
      sampleType: 'Blood',
      parameters: [
        { name: 'Haemoglobin', unit: 'g/dL', refLow: 13, refHigh: 17 },
        { name: 'WBC', unit: '10⁹/L', refLow: 4, refHigh: 11 },
        { name: 'Platelets', unit: '10⁹/L', refLow: 150, refHigh: 400 },
        { name: 'Haematocrit', unit: '%', refLow: 40, refHigh: 50 },
      ],
    },
    {
      name: 'Blood Sugar Fasting',
      department: 'laboratory',
      sampleType: 'Blood',
      parameters: [
        { name: 'Glucose', unit: 'mg/dL', refLow: 70, refHigh: 100 },
      ],
    },
    {
      name: 'Urine R/E',
      department: 'laboratory',
      sampleType: 'Urine',
      parameters: [
        { name: 'Colour', refText: 'Straw' },
        { name: 'Protein', refText: 'Negative' },
        { name: 'Glucose', refText: 'Negative' },
        { name: 'Pus cells', unit: '/HPF', refLow: 0, refHigh: 5 },
      ],
    },
    {
      name: 'LFT',
      department: 'laboratory',
      sampleType: 'Blood',
      parameters: [
        { name: 'ALT', unit: 'U/L', refLow: 7, refHigh: 56 },
        { name: 'AST', unit: 'U/L', refLow: 10, refHigh: 40 },
        { name: 'Bilirubin total', unit: 'mg/dL', refLow: 0.1, refHigh: 1.2 },
        {
          name: 'Alkaline phosphatase',
          unit: 'U/L',
          refLow: 44,
          refHigh: 147,
        },
      ],
    },
    { name: 'Chest X-Ray', department: 'radiology', parameters: [] },
    { name: 'Ultrasound Abdomen', department: 'radiology', parameters: [] },
  ];

  for (const t of tests) {
    const existing = await prisma.labTest.findFirst({
      where: { tenantId, name: t.name },
    });
    if (existing) continue;

    const service = await prisma.service.findFirst({
      where: { tenantId, name: t.name },
    });

    await prisma.labTest.create({
      data: {
        tenantId,
        name: t.name,
        department: t.department,
        sampleType: t.sampleType ?? null,
        serviceId: service?.id ?? null,
        parameters: {
          create: t.parameters.map((p, i) => ({
            tenantId,
            name: p.name,
            unit: p.unit ?? null,
            refLow: p.refLow ?? null,
            refHigh: p.refHigh ?? null,
            refText: p.refText ?? null,
            sortOrder: i,
          })),
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Wards & beds — enough of a layout to see a bed board. Occupancy is never
// seeded: a bed is occupied only when an admission opens an assignment on it.
// ---------------------------------------------------------------------------

async function seedWardsAndBeds(tenantId: string): Promise<void> {
  const floorByName = new Map<string, string>();
  for (const [name, sortOrder] of [
    ['Ground Floor', 0],
    ['First Floor', 1],
  ] as const) {
    const found =
      (await prisma.floor.findFirst({ where: { tenantId, name } })) ??
      (await prisma.floor.create({ data: { tenantId, name, sortOrder } }));
    floorByName.set(name, found.id);
  }

  const bedTypeByName = new Map<string, string>();
  for (const [name, defaultNightlyRateMinor] of [
    ['Standard', 200000],
    ['Private', 500000],
    ['ICU', 1500000],
  ] as const) {
    const found =
      (await prisma.bedType.findFirst({ where: { tenantId, name } })) ??
      (await prisma.bedType.create({
        data: { tenantId, name, defaultNightlyRateMinor },
      }));
    bedTypeByName.set(name, found.id);
  }

  const wardByName = new Map<string, string>();
  for (const [name, floorName] of [
    ['General Male', 'Ground Floor'],
    ['General Female', 'Ground Floor'],
    ['Private Ward', 'First Floor'],
    ['ICU', 'First Floor'],
  ] as const) {
    const floorId = floorByName.get(floorName)!;
    const found =
      (await prisma.ward.findFirst({ where: { tenantId, name } })) ??
      (await prisma.ward.create({ data: { tenantId, name, floorId } }));
    wardByName.set(name, found.id);
  }

  const ranges: {
    ward: string;
    bedType: string;
    prefix: string;
    from: number;
    to: number;
  }[] = [
    { ward: 'General Male', bedType: 'Standard', prefix: 'GF-', from: 1, to: 8 },
    { ward: 'General Female', bedType: 'Standard', prefix: 'GF-', from: 9, to: 14 },
    { ward: 'Private Ward', bedType: 'Private', prefix: 'FF-', from: 1, to: 4 },
    { ward: 'ICU', bedType: 'ICU', prefix: 'ICU-', from: 1, to: 3 },
  ];
  for (const r of ranges) {
    const wardId = wardByName.get(r.ward)!;
    const bedTypeId = bedTypeByName.get(r.bedType)!;
    for (let n = r.from; n <= r.to; n += 1) {
      const name = `${r.prefix}${n}`;
      const found = await prisma.bed.findFirst({ where: { tenantId, name } });
      if (!found) {
        await prisma.bed.create({
          data: { tenantId, wardId, bedTypeId, name },
        });
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
