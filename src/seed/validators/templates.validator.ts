import { z } from "zod";

export const TemplateStatusEnum = z.enum([
  "draft",
  "published",
  "shared",
  "assigned to product",
  "pending approval",
  "approved",
  "active",
  "rejected",
  "pending removal",
]);

export const TemplateSchema = z.object({
  id: z.string().nonempty("Id required"),
  industryId: z.string({
    required_error: "industryId is required",
    invalid_type_error: "industryId must be a string",
  }),

  industryName: z
    .string()
    .trim()
    .min(2, "industryName must be at least 2 characters")
    .max(255, "industryName must be ≤ 255 characters"),

  name: z
    .string()
    .trim()
    .min(2, "Template name must be at least 2 characters")
    .max(255, "Template name must be ≤ 255 characters"),

  status: TemplateStatusEnum.default("draft"),

  minFields: z.number().min(1).default(1),
  maxFields: z.number().min(1).max(300).default(300),

  minSectionLevels: z.number().min(1).default(1),
  maxSectionLevels: z.number().min(1).max(10).default(2),

  minSections: z.number().min(1).default(1),
  maxSections: z.number().min(1).max(20).default(20),
  priority: z.string().trim().nonempty(),
});

export type TemplateInput = z.infer<typeof TemplateSchema>;
