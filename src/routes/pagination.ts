import { z } from 'zod';

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  items: T[];
  pagination: { limit: number; offset: number; total: number };
}

export function paginated<T>(items: T[], total: number, p: Pagination): Paginated<T> {
  return { items, pagination: { limit: p.limit, offset: p.offset, total } };
}
