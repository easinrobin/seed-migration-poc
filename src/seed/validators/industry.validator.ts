import { z } from "zod";

export const IndustrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must have at least 2 characters")
    .max(64, "Name must be 64 characters or less"),
});

export type IndustryInput = z.infer<typeof IndustrySchema>;
