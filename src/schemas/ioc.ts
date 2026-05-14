import { z } from "zod";

export const iocTypeSchema = z.enum(["ip", "domain", "sha256"]);

export const lookupRequestSchema = z.object({
  type: iocTypeSchema,
  value: z.string().min(1, "value is required"),
});

export const iocUpsertRequestSchema = lookupRequestSchema.extend({
  source: z.string().min(1, "source is required"),
  score: z.number().int().min(0).max(100),
});

export type LookupRequestInput = z.infer<typeof lookupRequestSchema>;
export type IocUpsertRequestInput = z.infer<typeof iocUpsertRequestSchema>;
