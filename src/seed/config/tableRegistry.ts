import { db } from "../../db";
import { Industries, Templates, DefaultFields } from "../../db/schema";
import { IndustrySchema } from "../validators/industry.validator";
import { TemplateSchema } from "../validators/templates.validator";
import { DefaultFieldsSchema } from "../validators/defaultField.validator";

import { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

export type TableConfig<T extends PgTable = PgTable> = {
  table: T;
  queryTable: any; // Drizzle db.query.<Table>
  schema: z.ZodSchema<any>; // Zod schema for validation
  uniqueFields: readonly string[]; // Keys used to identify record
  displayField?: string; // For logging (optional)
};

export const TABLE_REGISTRY = {
  Industries: {
    table: Industries,
    queryTable: db.query.Industries,
    schema: IndustrySchema,
    uniqueFields: ["id"],
    displayField: "name",
  },
  Templates: {
    table: Templates,
    queryTable: db.query.Templates,
    schema: TemplateSchema,
    uniqueFields: ["industryId", "id"],
    displayField: "name",
  },
  DefaultFields: {
    table: DefaultFields,
    queryTable: db.query.DefaultFields,
    schema: DefaultFieldsSchema,
    uniqueFields: ["industryId", "id"],
    displayField: "name",
  },
} as const;

export type TableName = keyof typeof TABLE_REGISTRY;

export function getTableConfig<T extends TableName>(name: T): TableConfig {
  return TABLE_REGISTRY[name];
}
