import { z } from "zod";

export const DppDataTypeEnum = z.enum([
  "string",
  "number",
  "decimal",
  "bool",
  "set",
  "date",
  "file",
  "image",
]);

export const InputTypeEnum = z.enum([
  "input",
  "textarea",
  "bool",
  "dropdown",
  "radio",
  "checkbox",
  "range",
  "date",
  "upload",
]);

export const DefaultFieldsSchema = z.object({
  industryId: z
    .number({
      required_error: "industryId is required",
      invalid_type_error: "industryId must be a number",
    })
    .min(1, "industryId must be a positive integer"),

  defaultSectionId: z
    .number({
      required_error: "defaultSectionId is required",
      invalid_type_error: "defaultSectionId must be a number",
    })
    .min(1, "defaultSectionId must be a positive integer"),

  name: z
    .string()
    .trim()
    .min(2, "Template name must be at least 2 characters")
    .max(255, "Template name must be ≤ 255 characters"),

  sequence: z
    .number({
      required_error: "sequence is required",
      invalid_type_error: "sequence must be a number",
    })
    .min(1, "sequence must be a positive integer"),

  dataType: DppDataTypeEnum.default("string"),
  guiInputType: InputTypeEnum.default("input"),

  inputOptions: z.preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error("inputOptions must be valid JSON");
      }
    }
    return value;
  }, z.record(z.any()).optional().default({})),
  inputRules: z.preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error("inputRules must be valid JSON");
      }
    }
    return value;
  }, z.record(z.any()).optional().default({})),

  unit: z
    .string()
    .trim()
    .min(1, "unit is required")
    .max(100, "unit must be ≤ 100 characters"),

  unitSymbol: z
    .string()
    .trim()
    .min(1, "unitSymbol is required")
    .max(20, "unitSymbol must be ≤ 20 characters"),

  isEditable: z.boolean().default(false),
  isDeletable: z.boolean().default(false),
  isValidationOverridable: z.boolean().default(false),
});

export type DefaultFieldsInput = z.infer<typeof DefaultFieldsSchema>;
