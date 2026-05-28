import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { Errors } from './errors';

export interface CreateCompanyInput {
  name: string;
  website?: string;
  notes?: string;
}

export async function createCompany(input: CreateCompanyInput) {
  return prisma.company.create({ data: input });
}

export async function listCompanies(name: string | undefined, limit: number, offset: number) {
  const where: Prisma.CompanyWhereInput = {};
  if (name) where.name = { contains: name, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.company.count({ where }),
  ]);

  return { items, total };
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { contacts: true },
  });
  if (!company) throw Errors.notFound('Company not found');
  return company;
}
