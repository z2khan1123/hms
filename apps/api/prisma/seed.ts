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
  await seedPharmacy(tenantId);
  await seedFinance(tenantId);
  await seedInventory(tenantId);
  // Phases 3-5. These modules were built but never seeded, so every one of
  // their screens opened empty and the HR screens could not be used at all.
  await seedHr(tenantId);
  await seedBloodBank(tenantId);
  await seedAmbulance(tenantId);
  await seedFrontOffice(tenantId);
  await seedRegisters(tenantId);
  await seedAppointments(tenantId);
  await seedFinanceEntries(tenantId);

  console.log('\nSeed complete.');
  console.log('  Tenant:   %s (%s)', DEMO.tenantName, tenantId);
  console.log('  Login:    %s', DEMO.adminEmail);
  console.log('  Password: %s', DEMO.adminPassword);
  console.log(
    '  Staff:    doctor@ / receptionist@ / accountant@ / nurse@ / pharmacist@ /',
  );
  console.log(
    '            pathologist@ / radiologist@ / superadmin@demo-hospital.test',
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
  await ensureUser(
    tenantId,
    'pharmacist@demo-hospital.test',
    'Bilal',
    'Ahmed',
    'pharmacist',
    DEMO.staffPassword,
  );
  // The platform operator, not hospital staff. It holds `tenant:manage` and
  // `user:read` and nothing else — signing in as this role shows almost no
  // clinical screens, which is correct rather than broken.
  await ensureUser(
    tenantId,
    'superadmin@demo-hospital.test',
    'Platform',
    'Operator',
    'platform_admin',
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

// ---------------------------------------------------------------------------
// Pharmacy — medicine master, one opening batch per medicine, and one batch
// deliberately close to expiry so the expiring-stock report has something to
// show. The `allergenKeywords` are chosen so the prescribing allergy check is
// demonstrable: a "penicillin" allergy collides with Amoxicillin and Augmentin.
// ---------------------------------------------------------------------------

interface SeedMedicine {
  name: string;
  category: string;
  genericName: string;
  strength: string;
  unit: string;
  allergenKeywords: string[];
  purchasePriceMinor: number;
  salePriceMinor: number;
}

async function seedPharmacy(tenantId: string): Promise<void> {
  const categoryNames = [
    'Tablet',
    'Capsule',
    'Syrup',
    'Injection',
    'Ointment',
    'Drops',
  ];
  const categoryByName = new Map<string, string>();
  for (const name of categoryNames) {
    const found =
      (await prisma.medicineCategory.findFirst({
        where: { tenantId, name },
      })) ??
      (await prisma.medicineCategory.create({ data: { tenantId, name } }));
    categoryByName.set(name, found.id);
  }

  const medicines: SeedMedicine[] = [
    {
      name: 'Amoxicillin 500mg',
      category: 'Capsule',
      genericName: 'Amoxicillin',
      strength: '500mg',
      unit: 'capsule',
      allergenKeywords: ['penicillin', 'amoxicillin'],
      purchasePriceMinor: 800,
      salePriceMinor: 1200,
    },
    {
      name: 'Augmentin 625mg',
      category: 'Tablet',
      genericName: 'Amoxicillin + Clavulanic acid',
      strength: '625mg',
      unit: 'tablet',
      allergenKeywords: ['penicillin', 'amoxicillin', 'clavulanic acid'],
      purchasePriceMinor: 3500,
      salePriceMinor: 4800,
    },
    {
      name: 'Paracetamol 500mg',
      category: 'Tablet',
      genericName: 'Paracetamol',
      strength: '500mg',
      unit: 'tablet',
      allergenKeywords: [],
      purchasePriceMinor: 150,
      salePriceMinor: 300,
    },
    {
      name: 'Ibuprofen 400mg',
      category: 'Tablet',
      genericName: 'Ibuprofen',
      strength: '400mg',
      unit: 'tablet',
      allergenKeywords: ['nsaid', 'ibuprofen'],
      purchasePriceMinor: 400,
      salePriceMinor: 700,
    },
    {
      name: 'Ceftriaxone 1g',
      category: 'Injection',
      genericName: 'Ceftriaxone',
      strength: '1g',
      unit: 'vial',
      allergenKeywords: ['cephalosporin'],
      purchasePriceMinor: 9000,
      salePriceMinor: 13000,
    },
    {
      name: 'Omeprazole 20mg',
      category: 'Capsule',
      genericName: 'Omeprazole',
      strength: '20mg',
      unit: 'capsule',
      allergenKeywords: [],
      purchasePriceMinor: 500,
      salePriceMinor: 900,
    },
    {
      name: 'Cetirizine 10mg',
      category: 'Tablet',
      genericName: 'Cetirizine',
      strength: '10mg',
      unit: 'tablet',
      allergenKeywords: [],
      purchasePriceMinor: 250,
      salePriceMinor: 500,
    },
    {
      name: 'Metformin 500mg',
      category: 'Tablet',
      genericName: 'Metformin',
      strength: '500mg',
      unit: 'tablet',
      allergenKeywords: [],
      purchasePriceMinor: 300,
      salePriceMinor: 600,
    },
  ];

  const now = new Date();
  const longExpiry = new Date(now);
  longExpiry.setMonth(longExpiry.getMonth() + 18);
  const soonExpiry = new Date(now);
  soonExpiry.setDate(soonExpiry.getDate() + 20);

  for (const m of medicines) {
    const categoryId = categoryByName.get(m.category)!;
    let medicine = await prisma.medicine.findFirst({
      where: { tenantId, name: m.name, strength: m.strength },
    });
    medicine ??= await prisma.medicine.create({
      data: {
        tenantId,
        name: m.name,
        genericName: m.genericName,
        categoryId,
        strength: m.strength,
        unit: m.unit,
        reorderLevel: 50,
        allergenKeywords: m.allergenKeywords,
      },
    });

    await ensureBatch(tenantId, medicine.id, {
      batchNo: 'B-2026-01',
      expiryDate: longExpiry,
      quantity: 200,
      purchasePriceMinor: m.purchasePriceMinor,
      salePriceMinor: m.salePriceMinor,
    });

    // A second, nearly-expired batch on Paracetamol for the expiry report.
    if (m.name === 'Paracetamol 500mg') {
      await ensureBatch(tenantId, medicine.id, {
        batchNo: 'B-2025-12',
        expiryDate: soonExpiry,
        quantity: 40,
        purchasePriceMinor: m.purchasePriceMinor,
        salePriceMinor: m.salePriceMinor,
      });
    }
  }
}

async function ensureBatch(
  tenantId: string,
  medicineId: string,
  batch: {
    batchNo: string;
    expiryDate: Date;
    quantity: number;
    purchasePriceMinor: number;
    salePriceMinor: number;
  },
): Promise<void> {
  const found = await prisma.medicineBatch.findFirst({
    where: { tenantId, medicineId, batchNo: batch.batchNo },
  });
  if (found) return;
  await prisma.medicineBatch.create({
    data: { tenantId, medicineId, ...batch },
  });
}

// ---------------------------------------------------------------------------
// Finance — ledger heads and referrers. Entries themselves are left for the
// user to post; the heads are what make the "new income / new expense" forms
// usable out of the box.
// ---------------------------------------------------------------------------

async function seedFinance(tenantId: string): Promise<void> {
  const incomeHeads = [
    'Consultation',
    'Pharmacy',
    'Laboratory',
    'Radiology',
    'Room rent',
    'Other',
  ];
  for (const name of incomeHeads) {
    const found = await prisma.incomeHead.findFirst({
      where: { tenantId, name },
    });
    if (!found) await prisma.incomeHead.create({ data: { tenantId, name } });
  }

  const expenseHeads = [
    'Salaries',
    'Rent',
    'Utilities',
    'Medical supplies',
    'Equipment',
    'Maintenance',
    'Other',
  ];
  for (const name of expenseHeads) {
    const found = await prisma.expenseHead.findFirst({
      where: { tenantId, name },
    });
    if (!found) await prisma.expenseHead.create({ data: { tenantId, name } });
  }

  const referrers: { name: string; category: string; commissionBps: number }[] =
    [
      { name: 'Dr Imran Clinic', category: 'Doctor', commissionBps: 1000 },
      { name: 'City Medical Store', category: 'Pharmacy', commissionBps: 500 },
    ];
  for (const r of referrers) {
    const found = await prisma.referrer.findFirst({
      where: { tenantId, name: r.name },
    });
    if (!found) {
      await prisma.referrer.create({
        data: {
          tenantId,
          name: r.name,
          category: r.category,
          commissionBps: r.commissionBps,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Inventory — categories, two stores, a handful of general supplies, and one
// opening `receipt` per item into the Main Store so quantities are non-zero.
// "Face mask" is deliberately received below its reorder level so the
// low-stock filter has something to show.
// ---------------------------------------------------------------------------

async function seedInventory(tenantId: string): Promise<void> {
  const categoryByName = new Map<string, string>();
  for (const name of ['Consumables', 'Linen', 'PPE', 'Stationery', 'Equipment']) {
    const found =
      (await prisma.itemCategory.findFirst({ where: { tenantId, name } })) ??
      (await prisma.itemCategory.create({ data: { tenantId, name } }));
    categoryByName.set(name, found.id);
  }

  const storeByName = new Map<string, string>();
  for (const name of ['Main Store', 'Ward Store']) {
    const found =
      (await prisma.store.findFirst({ where: { tenantId, name } })) ??
      (await prisma.store.create({ data: { tenantId, name } }));
    storeByName.set(name, found.id);
  }
  const mainStoreId = storeByName.get('Main Store')!;

  const items: {
    name: string;
    category: string;
    unit: string;
    reorderLevel: number;
    opening: number;
  }[] = [
    // opening > reorderLevel everywhere except Face mask, which is left low.
    { name: 'Syringe 5ml', category: 'Consumables', unit: 'piece', reorderLevel: 500, opening: 800 },
    { name: 'Surgical gloves', category: 'PPE', unit: 'pair', reorderLevel: 300, opening: 450 },
    { name: 'Bed sheet', category: 'Linen', unit: 'piece', reorderLevel: 100, opening: 220 },
    { name: 'Face mask', category: 'PPE', unit: 'piece', reorderLevel: 1000, opening: 400 },
    { name: 'Cotton roll', category: 'Consumables', unit: 'roll', reorderLevel: 200, opening: 260 },
  ];

  for (const it of items) {
    const categoryId = categoryByName.get(it.category)!;
    let item = await prisma.inventoryItem.findFirst({
      where: { tenantId, name: it.name },
    });
    item ??= await prisma.inventoryItem.create({
      data: {
        tenantId,
        name: it.name,
        categoryId,
        unit: it.unit,
        reorderLevel: it.reorderLevel,
      },
    });

    // Idempotent opening balance: one receipt per (item, Main Store) tagged so
    // re-running the seed does not stack another one on top.
    const opening = await prisma.stockMove.findFirst({
      where: {
        tenantId,
        itemId: item.id,
        storeId: mainStoreId,
        kind: 'receipt',
        note: 'Opening balance',
      },
    });
    if (!opening) {
      await prisma.stockMove.create({
        data: {
          tenantId,
          itemId: item.id,
          storeId: mainStoreId,
          kind: 'receipt',
          quantity: it.opening,
          note: 'Opening balance',
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Document numbers
//
// The application mints these through SequenceService, which bumps a counter on
// `Tenant` and formats `<prefix>-<6 digits>`. The seed goes through the same
// counters rather than writing literals like 'EMP-000001', so a number seeded
// here can never later be minted a second time by the running app.
// ---------------------------------------------------------------------------

const SEQUENCES = {
  staff: { seq: 'staffSeq', prefix: 'staffPrefix' },
  donor: { seq: 'donorSeq', prefix: 'donorPrefix' },
  call: { seq: 'callSeq', prefix: 'callPrefix' },
  birth: { seq: 'birthSeq', prefix: 'birthPrefix' },
  death: { seq: 'deathSeq', prefix: 'deathPrefix' },
  visitor: { seq: 'visitorSeq', prefix: 'visitorPrefix' },
  complaint: { seq: 'complaintSeq', prefix: 'complaintPrefix' },
} as const;

async function nextNo(
  tenantId: string,
  kind: keyof typeof SEQUENCES,
): Promise<string> {
  const counter = SEQUENCES[kind];
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { [counter.seq]: { increment: 1 } } as Prisma.TenantUpdateInput,
  });
  const record = tenant as unknown as Record<string, string | number>;
  return `${record[counter.prefix]}-${String(record[counter.seq]).padStart(6, '0')}`;
}

/** Midnight today, so seeded dates sit relative to whenever the seed is run. */
function dayOffset(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function at(days: number, hour: number, minute = 0): Date {
  const d = dayOffset(days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Human resources
//
// Every seeded user gets a staff record. Without one the HR module has nothing
// to attach attendance, leave or payroll to, and its screens are not merely
// empty but unusable — `/hr/leave/balance` cannot even be called without a
// staff id to ask about.
// ---------------------------------------------------------------------------

async function seedHr(tenantId: string): Promise<void> {
  const departmentByName = new Map<string, string>();
  for (const name of [
    'Administration',
    'Outpatient',
    'Inpatient',
    'Laboratory',
    'Radiology',
    'Pharmacy',
    'Accounts',
  ]) {
    const row =
      (await prisma.department.findFirst({ where: { tenantId, name } })) ??
      (await prisma.department.create({ data: { tenantId, name } }));
    departmentByName.set(name, row.id);
  }

  const designationByName = new Map<string, string>();
  for (const name of [
    'Hospital Administrator',
    'Consultant',
    'Medical Officer',
    'Staff Nurse',
    'Pharmacist',
    'Lab Technologist',
    'Radiographer',
    'Accountant',
    'Receptionist',
  ]) {
    const row =
      (await prisma.designation.findFirst({ where: { tenantId, name } })) ??
      (await prisma.designation.create({ data: { tenantId, name } }));
    designationByName.set(name, row.id);
  }

  for (const s of [
    { name: 'Morning', startTime: '08:00', endTime: '16:00' },
    { name: 'Evening', startTime: '16:00', endTime: '00:00' },
    { name: 'Night', startTime: '00:00', endTime: '08:00' },
  ]) {
    const found = await prisma.shift.findFirst({
      where: { tenantId, name: s.name },
    });
    if (!found) await prisma.shift.create({ data: { tenantId, ...s } });
  }

  for (const l of [
    { name: 'Annual', daysPerYear: 20, isPaid: true },
    { name: 'Casual', daysPerYear: 10, isPaid: true },
    { name: 'Sick', daysPerYear: 12, isPaid: true },
    { name: 'Unpaid', daysPerYear: null, isPaid: false },
  ]) {
    const found = await prisma.leaveType.findFirst({
      where: { tenantId, name: l.name },
    });
    if (!found) await prisma.leaveType.create({ data: { tenantId, ...l } });
  }

  // One staff record per user, keyed on userId (which is unique on the model).
  const staffByEmail: Record<
    string,
    { department: string; designation: string; salary: number }
  > = {
    'admin@demo-hospital.test': {
      department: 'Administration',
      designation: 'Hospital Administrator',
      salary: 25000000,
    },
    'doctor@demo-hospital.test': {
      department: 'Outpatient',
      designation: 'Consultant',
      salary: 40000000,
    },
    'nurse@demo-hospital.test': {
      department: 'Inpatient',
      designation: 'Staff Nurse',
      salary: 9000000,
    },
    'pharmacist@demo-hospital.test': {
      department: 'Pharmacy',
      designation: 'Pharmacist',
      salary: 12000000,
    },
    'pathologist@demo-hospital.test': {
      department: 'Laboratory',
      designation: 'Lab Technologist',
      salary: 15000000,
    },
    'radiologist@demo-hospital.test': {
      department: 'Radiology',
      designation: 'Radiographer',
      salary: 15000000,
    },
    'accountant@demo-hospital.test': {
      department: 'Accounts',
      designation: 'Accountant',
      salary: 14000000,
    },
    'receptionist@demo-hospital.test': {
      department: 'Administration',
      designation: 'Receptionist',
      salary: 7000000,
    },
  };

  const staffIds: string[] = [];
  for (const [email, spec] of Object.entries(staffByEmail)) {
    const user = await prisma.user.findFirst({ where: { tenantId, email } });
    if (!user) continue;

    const existing = await prisma.staffProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      staffIds.push(existing.id);
      continue;
    }

    const created = await prisma.staffProfile.create({
      data: {
        tenantId,
        userId: user.id,
        staffNo: await nextNo(tenantId, 'staff'),
        departmentId: departmentByName.get(spec.department),
        designationId: designationByName.get(spec.designation),
        joinedOn: dayOffset(-400),
        basicSalaryMinor: spec.salary,
      },
    });
    staffIds.push(created.id);
  }

  // A fortnight of attendance, so the HR screens and the attendance percentage
  // have something real to compute. Weekends are Saturday and Sunday here.
  for (const staffId of staffIds) {
    for (let back = 14; back >= 1; back--) {
      const onDate = dayOffset(-back);
      const weekday = onDate.getDay();
      const status =
        weekday === 0 || weekday === 6
          ? 'holiday'
          : back % 7 === 3
            ? 'late'
            : back % 11 === 5
              ? 'on_leave'
              : 'present';
      const found = await prisma.staffAttendance.findFirst({
        where: { tenantId, staffId, onDate },
      });
      if (found) continue;
      await prisma.staffAttendance.create({
        data: {
          tenantId,
          staffId,
          onDate,
          status,
          checkIn: status === 'present' || status === 'late'
            ? at(-back, status === 'late' ? 9 : 8, status === 'late' ? 40 : 5)
            : null,
          checkOut:
            status === 'present' || status === 'late' ? at(-back, 16, 10) : null,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Blood bank — donors across the groups, and stock with a deliberate spread:
// available units, one already issued, one expiring soon and one expired, so
// the derived status of a unit is visibly doing its job.
// ---------------------------------------------------------------------------

async function seedBloodBank(tenantId: string): Promise<void> {
  if ((await prisma.donor.count({ where: { tenantId } })) > 0) return;

  const donors: {
    firstName: string;
    lastName: string;
    bloodGroup: 'A_POS' | 'B_POS' | 'O_POS' | 'O_NEG' | 'AB_POS' | 'A_NEG';
    phone: string;
  }[] = [
    { firstName: 'Imran', lastName: 'Sheikh', bloodGroup: 'O_POS', phone: '+923001110001' },
    { firstName: 'Hina', lastName: 'Baig', bloodGroup: 'A_POS', phone: '+923001110002' },
    { firstName: 'Kashif', lastName: 'Raza', bloodGroup: 'B_POS', phone: '+923001110003' },
    { firstName: 'Nadia', lastName: 'Aslam', bloodGroup: 'O_NEG', phone: '+923001110004' },
    { firstName: 'Tariq', lastName: 'Mehmood', bloodGroup: 'AB_POS', phone: '+923001110005' },
    { firstName: 'Rabia', lastName: 'Yousuf', bloodGroup: 'A_NEG', phone: '+923001110006' },
  ];

  const donorIds: { id: string; bloodGroup: string }[] = [];
  for (const d of donors) {
    const row = await prisma.donor.create({
      data: {
        tenantId,
        donorNo: await nextNo(tenantId, 'donor'),
        firstName: d.firstName,
        lastName: d.lastName,
        bloodGroup: d.bloodGroup,
        phone: d.phone,
      },
    });
    donorIds.push({ id: row.id, bloodGroup: d.bloodGroup });
  }

  // Whole blood keeps for 35 days; the dates below are chosen against that.
  let bag = 1;
  for (const donor of donorIds) {
    for (const collectedDaysAgo of [5, 20]) {
      await prisma.bloodUnit.create({
        data: {
          tenantId,
          bagNo: `BAG-${String(bag++).padStart(5, '0')}`,
          bloodGroup: donor.bloodGroup as never,
          component: 'whole_blood',
          donorId: donor.id,
          collectedOn: dayOffset(-collectedDaysAgo),
          expiresOn: dayOffset(35 - collectedDaysAgo),
          volumeMl: 450,
          screenedAt: at(-collectedDaysAgo + 1, 10),
          screeningPassed: true,
        },
      });
    }
  }

  // One expired and one already issued, so both derived states are represented.
  await prisma.bloodUnit.create({
    data: {
      tenantId,
      bagNo: `BAG-${String(bag++).padStart(5, '0')}`,
      bloodGroup: 'O_POS',
      component: 'packed_red_cells',
      donorId: donorIds[0].id,
      collectedOn: dayOffset(-50),
      expiresOn: dayOffset(-15),
      volumeMl: 300,
      screenedAt: at(-49, 10),
      screeningPassed: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Ambulance
// ---------------------------------------------------------------------------

async function seedAmbulance(tenantId: string): Promise<void> {
  const vehicles: {
    registrationNo: string;
    model: string;
    type: 'basic' | 'advanced_life_support' | 'patient_transport';
    driverName: string;
    driverPhone: string;
    baseChargeMinor: number;
    perKmChargeMinor: number;
  }[] = [
    {
      registrationNo: 'LEA-1234',
      model: 'Toyota Hiace',
      type: 'basic',
      driverName: 'Shahid Iqbal',
      driverPhone: '+923002220001',
      baseChargeMinor: 150000,
      perKmChargeMinor: 5000,
    },
    {
      registrationNo: 'LEB-5678',
      model: 'Ford Transit',
      type: 'advanced_life_support',
      driverName: 'Waqar Ali',
      driverPhone: '+923002220002',
      baseChargeMinor: 400000,
      perKmChargeMinor: 9000,
    },
    {
      registrationNo: 'LEC-9012',
      model: 'Suzuki Bolan',
      type: 'patient_transport',
      driverName: 'Zubair Khan',
      driverPhone: '+923002220003',
      baseChargeMinor: 80000,
      perKmChargeMinor: 3500,
    },
  ];
  for (const v of vehicles) {
    const found = await prisma.vehicle.findFirst({
      where: { tenantId, registrationNo: v.registrationNo },
    });
    if (!found) await prisma.vehicle.create({ data: { tenantId, ...v } });
  }
}

// ---------------------------------------------------------------------------
// Front office — the visitor book, the call log and the complaint register.
// Two visitors are left without a `leftAt` so the "still inside" list, which is
// derived rather than stored, is not empty.
// ---------------------------------------------------------------------------

async function seedFrontOffice(tenantId: string): Promise<void> {
  if ((await prisma.visitorLog.count({ where: { tenantId } })) > 0) return;

  const visitors: {
    name: string;
    phone: string;
    visitingWhom: string;
    purpose: string;
    arrivedAt: Date;
    leftAt: Date | null;
  }[] = [
    {
      name: 'Asif Nawaz',
      phone: '+923003330001',
      visitingWhom: 'Ward GF-9',
      purpose: 'Family visit',
      arrivedAt: at(0, 10, 15),
      leftAt: null,
    },
    {
      name: 'Saima Bibi',
      phone: '+923003330002',
      visitingWhom: 'Dr Ayesha Khan',
      purpose: 'Medical representative',
      arrivedAt: at(0, 11, 30),
      leftAt: null,
    },
    {
      name: 'Rashid Minhas',
      phone: '+923003330003',
      visitingWhom: 'Accounts',
      purpose: 'Vendor payment',
      arrivedAt: at(-1, 9, 0),
      leftAt: at(-1, 9, 45),
    },
  ];
  for (const v of visitors) {
    await prisma.visitorLog.create({
      data: { tenantId, passNo: await nextNo(tenantId, 'visitor'), ...v },
    });
  }

  await prisma.phoneCallLog.createMany({
    data: [
      {
        tenantId,
        direction: 'incoming',
        callerName: 'Gul Nawaz',
        phone: '+923004440001',
        purpose: 'Asking about OPD timings',
        calledAt: at(0, 9, 20),
        durationMinutes: 3,
        outcome: 'Advised 8am to 2pm',
      },
      {
        tenantId,
        direction: 'outgoing',
        callerName: 'Fatima Riaz',
        phone: '+923004440002',
        purpose: 'Report ready for collection',
        calledAt: at(-1, 15, 10),
        durationMinutes: 2,
        outcome: 'Will collect tomorrow',
      },
    ],
  });

  await prisma.complaint.create({
    data: {
      tenantId,
      reference: await nextNo(tenantId, 'complaint'),
      complainantName: 'Nasir Abbas',
      phone: '+923005550001',
      about: 'Waiting time',
      severity: 'medium',
      description: 'Waited over two hours in OPD despite an appointment.',
      status: 'open',
      receivedAt: at(-2, 12, 0),
    },
  });
}

// ---------------------------------------------------------------------------
// Statutory registers — the hospital issues the certificate; the family
// registers it with the Union Council, which is recorded back as a
// registration number. One of each is left unregistered on purpose.
// ---------------------------------------------------------------------------

async function seedRegisters(tenantId: string): Promise<void> {
  if ((await prisma.birthRecord.count({ where: { tenantId } })) > 0) return;

  const mother = await prisma.patient.findFirst({
    where: { tenantId, gender: 'female' },
  });
  const attendedBy = await prisma.practitioner.findFirst({ where: { tenantId } });

  await prisma.birthRecord.create({
    data: {
      tenantId,
      certificateNo: await nextNo(tenantId, 'birth'),
      childName: 'Baby of Fatima Riaz',
      gender: 'female',
      bornAt: at(-9, 4, 25),
      birthWeightGrams: 3100,
      deliveryType: 'normal',
      motherPatientId: mother?.id,
      motherName: mother ? `${mother.firstName} ${mother.lastName}` : 'Fatima Riaz',
      fatherName: 'Riaz Ahmed',
      contactPhone: '+923006660001',
      attendedById: attendedBy?.id,
    },
  });

  await prisma.birthRecord.create({
    data: {
      tenantId,
      certificateNo: await nextNo(tenantId, 'birth'),
      childName: 'Baby of Zainab Bibi',
      gender: 'male',
      bornAt: at(-30, 21, 10),
      birthWeightGrams: 2850,
      deliveryType: 'caesarean',
      motherName: 'Zainab Bibi',
      fatherName: 'Ghulam Farid',
      contactPhone: '+923006660002',
      attendedById: attendedBy?.id,
      registrationNo: 'UC-LHR-2026-00841',
      registeredOn: dayOffset(-18),
    },
  });
}

// ---------------------------------------------------------------------------
// Appointments — a diary with something in it, spread across the practitioners
// and across today and the coming days.
// ---------------------------------------------------------------------------

async function seedAppointments(tenantId: string): Promise<void> {
  if ((await prisma.appointment.count({ where: { tenantId } })) > 0) return;

  const patients = await prisma.patient.findMany({
    where: { tenantId },
    take: 4,
    orderBy: { mrn: 'asc' },
  });
  const practitioners = await prisma.practitioner.findMany({
    where: { tenantId },
    orderBy: { firstName: 'asc' },
  });
  if (patients.length === 0 || practitioners.length === 0) return;

  const slots: { day: number; hour: number; reason: string }[] = [
    { day: 0, hour: 9, reason: 'Follow-up' },
    { day: 0, hour: 11, reason: 'New complaint — chest pain' },
    { day: 1, hour: 10, reason: 'Routine review' },
    { day: 2, hour: 12, reason: 'Report discussion' },
    { day: 3, hour: 9, reason: 'Vaccination' },
  ];

  for (const [i, slot] of slots.entries()) {
    const startsAt = at(slot.day, slot.hour);
    const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        tenantId,
        patientId: patients[i % patients.length].id,
        practitionerId: practitioners[i % practitioners.length].id,
        startsAt,
        endsAt,
        reason: slot.reason,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Finance transactions. The heads and referrers were already seeded; without
// entries against them the ledgers, the net position and every finance report
// read as zero.
// ---------------------------------------------------------------------------

async function seedFinanceEntries(tenantId: string): Promise<void> {
  if ((await prisma.income.count({ where: { tenantId } })) > 0) return;

  const headId = async (name: string): Promise<string | null> =>
    (await prisma.incomeHead.findFirst({ where: { tenantId, name } }))?.id ?? null;
  const expenseHeadId = async (name: string): Promise<string | null> =>
    (await prisma.expenseHead.findFirst({ where: { tenantId, name } }))?.id ?? null;

  const incomes: [string, string, number, number][] = [
    ['Consultation', 'OPD consultations — week total', 4850000, -3],
    ['Pharmacy', 'Pharmacy counter sales', 6320000, -3],
    ['Laboratory', 'Lab tests', 2140000, -2],
    ['Radiology', 'X-ray and ultrasound', 1780000, -2],
    ['Room rent', 'Ward charges', 3600000, -1],
    ['Consultation', 'OPD consultations', 1250000, 0],
  ];
  for (const [head, description, amountMinor, day] of incomes) {
    const id = await headId(head);
    if (!id) continue;
    await prisma.income.create({
      data: { tenantId, headId: id, description, amountMinor, receivedAt: at(day, 17) },
    });
  }

  const expenses: [string, string, number, number][] = [
    ['Salaries', 'Staff salaries — last month', 118000000, -5],
    ['Utilities', 'Electricity bill', 8450000, -4],
    ['Medical supplies', 'Consumables restock', 6200000, -3],
    ['Maintenance', 'Generator servicing', 1750000, -2],
    ['Rent', 'Building rent', 45000000, -1],
  ];
  for (const [head, description, amountMinor, day] of expenses) {
    const id = await expenseHeadId(head);
    if (!id) continue;
    await prisma.expense.create({
      data: { tenantId, headId: id, description, amountMinor, paidAt: at(day, 12) },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
