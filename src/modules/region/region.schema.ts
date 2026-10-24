import { z } from 'zod';

export const REGION_QUERY_MAX = 60;
export const REGION_SEARCH_LIMIT = 50;

export const provinceCodeParamsSchema = z.object({ code: z.coerce.number().int().positive() });

export const regionSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(REGION_QUERY_MAX),
});

export const provinceSchema = z.object({
  code: z.number().int(),
  name: z.string(),
  fullName: z.string(),
  formerNames: z.array(z.string()),
  aliases: z.array(z.string()),
});

export const wardSchema = z.object({
  code: z.number().int(),
  provinceCode: z.number().int(),
  name: z.string(),
  formerNames: z.array(z.string()),
});

export const regionHitSchema = z.object({
  kind: z.enum(['province', 'ward']),
  code: z.number().int(),
  name: z.string(),
  provinceCode: z.number().int(),
  provinceName: z.string(),
  formerNames: z.array(z.string()),
});
