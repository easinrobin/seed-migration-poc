import { z } from "zod";

export const IndustrySchema = z.object({
  id: z.string().nonempty("Id required"),
  name: z
    .string()
    .trim()
    .min(2, "Name must have at least 2 characters")
    .max(64, "Name must be 64 characters or less"),
  priority: z.string().trim().nonempty(),
});

export type IndustryInput = z.infer<typeof IndustrySchema>;
