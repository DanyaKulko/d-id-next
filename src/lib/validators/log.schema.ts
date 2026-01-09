import { z } from "zod";

export const externalLogSchema = z.object({
  source: z.string().min(1).max(80),
  type: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  level: z.enum(["INFO", "WARNING", "ERROR"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ExternalLogInput = z.infer<typeof externalLogSchema>;
