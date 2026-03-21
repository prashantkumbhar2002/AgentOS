import bcrypt from 'bcrypt';
import type { PrismaClient, User } from '@prisma/client';

const BCRYPT_ROUNDS = 10;

export async function findByEmail(
  prisma: PrismaClient,
  email: string,
): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createUser(
  prisma: PrismaClient,
  data: { email: string; password: string; name: string; role: string },
): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
    },
  });
}
