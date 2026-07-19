import 'dotenv/config';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Creates (or leaves untouched) a single ADMIN user from env vars.
// Admins cannot self-register through the API, so this is the bootstrap path.
async function main() {
  const prisma = new PrismaClient();
  const email = process.env.ADMIN_EMAIL;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'MatchVenture Admin';

  if (!email || !phone || !password) {
    throw new Error(
      'Set ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD in the environment / .env',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name,
      email,
      phone,
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  console.log(`Admin ready: ${admin.email} (id=${admin.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
