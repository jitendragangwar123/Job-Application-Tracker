import { prisma } from '../db/prisma';
import { Errors } from './errors';

export interface CreateContactInput {
  companyId: string;
  name: string;
  email?: string;
  role?: string;
}

export async function createContact(input: CreateContactInput) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) throw Errors.invalidInput(`Company ${input.companyId} does not exist`);

  return prisma.contact.create({ data: input });
}

export async function listContacts(
  companyId: string | undefined,
  limit: number,
  offset: number,
) {
  const where = companyId ? { companyId } : {};
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.contact.count({ where }),
  ]);
  return { items, total };
}
