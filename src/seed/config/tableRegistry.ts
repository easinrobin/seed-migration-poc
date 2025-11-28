import { db } from "../../db";
import { Industries, Templates, DefaultFields } from "../../db/schema";
import { IndustrySchema } from "../validators/industry.validator";
import { TemplateSchema } from "../validators/templates.validator";
import { DefaultFieldsSchema } from "../validators/defaultField.validator";

import { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

export type TableConfig<Row = any, T extends PgTable = PgTable> = {
  table: T;
  queryTable: any; // Drizzle db.query.<Table>
  schema: z.ZodSchema<any>; // Zod schema for validation
  uniqueFields: readonly string[]; // Keys used to identify record
  displayField?: string; // For logging (optional)
  references: any[];
  loadAll(): Promise<Row[]>;
};

export const TABLE_REGISTRY = {
  Industries: {
    table: Industries,
    queryTable: db.query.Industries,
    schema: IndustrySchema,
    uniqueFields: ["id"],
    displayField: "name",
    references: [],
    loadAll: async () => await db.select().from(Industries),
  } satisfies TableConfig<typeof Industries.$inferSelect>,

  Templates: {
    table: Templates,
    queryTable: db.query.Templates,
    schema: TemplateSchema,
    uniqueFields: ["industryId", "id"],
    displayField: "name",
    loadAll: async () => await db.select().from(Templates),
    references: [
      {
        field: "industryId",
        references: { table: "Industries", field: "id" },
      },
    ],
  } satisfies TableConfig<typeof Templates.$inferSelect>,

  DefaultFields: {
    table: DefaultFields,
    queryTable: db.query.DefaultFields,
    schema: DefaultFieldsSchema,
    uniqueFields: ["industryId", "id"],
    displayField: "name",
    references: [
      {
        field: "industryId",
        references: { table: "Industries", field: "id" },
      },
      { field: "templateId", references: { table: "Templates", field: "id" } },
    ],
    loadAll: async () => await db.select().from(DefaultFields),
  } satisfies TableConfig<typeof DefaultFields.$inferSelect>,
} as const;

export type TableName = keyof typeof TABLE_REGISTRY;

export function getTableConfig<T extends TableName>(
  name: T
): (typeof TABLE_REGISTRY)[T] {
  return TABLE_REGISTRY[name];
}
