import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO = {
  tenantName: 'Demo Hospital',
  slug: 'demo-hospital',
  mrnPrefix: 'DMO',
  adminEmail: 'admin@demo-hospital.test',
  adminPassword: 'ChangeMe123!demo',
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

  const existingAdmin = await prisma.user.findFirst({
    where: { email: DEMO.adminEmail },
  });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: DEMO.adminEmail,
        passwordHash: await bcrypt.hash(DEMO.adminPassword, 12),
        firstName: 'Demo',
        lastName: 'Admin',
        role: 'hospital_admin',
      },
    });
  }

  if ((await prisma.practitioner.count({ where: { tenantId: tenant.id } })) === 0) {
    await prisma.practitioner.createMany({
      data: [
        { tenantId: tenant.id, firstName: 'Ayesha', lastName: 'Khan', specialty: 'General Medicine' },
        { tenantId: tenant.id, firstName: 'Bilal', lastName: 'Ahmed', specialty: 'Pediatrics' },
        { tenantId: tenant.id, firstName: 'Sana', lastName: 'Malik', specialty: 'Cardiology' },
      ],
    });
  }

  if ((await prisma.patient.count({ where: { tenantId: tenant.id } })) === 0) {
    await prisma.patient.createMany({
      data: [
        {
          tenantId: tenant.id,
          mrn: `${DEMO.mrnPrefix}-000001`,
          firstName: 'Fatima',
          lastName: 'Riaz',
          gender: 'female',
          birthDate: new Date('1990-04-12'),
          phone: '+923001234567',
        },
        {
          tenantId: tenant.id,
          mrn: `${DEMO.mrnPrefix}-000002`,
          firstName: 'Usman',
          lastName: 'Tariq',
          gender: 'male',
          birthDate: new Date('1985-11-03'),
          phone: '+923219876543',
        },
      ],
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { mrnSeq: 2 },
    });
  }

  console.log('\nSeed complete.');
  console.log('  Tenant:   %s (%s)', DEMO.tenantName, tenant.id);
  console.log('  Login:    %s', DEMO.adminEmail);
  console.log('  Password: %s', DEMO.adminPassword);
  console.log('  ^ change this before deploying anywhere real.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
