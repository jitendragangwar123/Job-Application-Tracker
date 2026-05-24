import { PrismaClient, ApplicationStatus } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// Placeholder hash so seed doesn't depend on the auth module yet.
// Real bcrypt/argon2 hashing lands in Step 3.
function fakeHash(pw: string): string {
  return 'sha256$' + createHash('sha256').update(pw).digest('hex');
}

async function main() {
  // Wipe in FK-safe order so seed is idempotent across runs.
  await prisma.event.deleteMany();
  await prisma.application.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  const [alice, bob] = await Promise.all([
    prisma.user.create({
      data: { email: 'alice@example.com', passwordHash: fakeHash('alice-pw') },
    }),
    prisma.user.create({
      data: { email: 'bob@example.com', passwordHash: fakeHash('bob-pw') },
    }),
  ]);

  const [acme, globex] = await Promise.all([
    prisma.company.create({
      data: {
        name: 'Acme Corp',
        website: 'https://acme.example',
        contacts: {
          create: [{ name: 'Jane Recruiter', email: 'jane@acme.example', role: 'Recruiter' }],
        },
      },
    }),
    prisma.company.create({
      data: { name: 'Globex', website: 'https://globex.example' },
    }),
  ]);

  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  await prisma.application.createMany({
    data: [
      {
        userId: alice.id,
        companyId: acme.id,
        role: 'Senior Backend Engineer',
        status: ApplicationStatus.APPLIED,
        appliedAt: daysAgo(10), // stale — should trigger follow-up in Step 7
      },
      {
        userId: alice.id,
        companyId: globex.id,
        role: 'Staff Engineer',
        status: ApplicationStatus.INTERVIEW,
        appliedAt: daysAgo(20),
        lastFollowedUpAt: daysAgo(3),
      },
      {
        userId: bob.id,
        companyId: acme.id,
        role: 'Engineering Manager',
        status: ApplicationStatus.REJECTED,
        appliedAt: daysAgo(30),
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    applications: await prisma.application.count(),
    contacts: await prisma.contact.count(),
  };
  // eslint-disable-next-line no-console
  console.log('[seed] inserted', counts);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
