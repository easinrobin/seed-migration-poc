import * as drizzle from "drizzle-orm/pg-core";
import { Industries } from "./industries.schema";
import { relations } from "drizzle-orm";

const DppDataTypeEnum = drizzle.pgEnum("dpp_data_type_enum", [
  "string",
  "number",
  "decimal",
  "bool",
  "set",
  "date",
  "file",
  "image",
]);

const InputTypeEnum = drizzle.pgEnum("gui_input_type_enum", [
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

export const DefaultFields = drizzle.pgTable(
  "defaultField",
  {
    id: drizzle.serial("id").primaryKey(),
    industryId: drizzle
      .integer("industry_id")
      .references((): drizzle.AnyPgColumn => Industries.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    defaultSectionId: drizzle.integer("default_section_id").notNull(),

    name: drizzle.varchar("name", { length: 255 }).notNull(),
    sequence: drizzle.integer("sequence").notNull(),

    dataType: DppDataTypeEnum("dpp_data_type").notNull(),
    guiInputType: InputTypeEnum("gui_input_type").notNull(),

    inputOptions: drizzle.json("input_options").default({}),
    inputRules: drizzle.json("input_rules").default({}),
    unit: drizzle.varchar("unit", { length: 100 }).notNull(),
    unitSymbol: drizzle.varchar("unit_symbol", { length: 20 }).notNull(),
    isEditable: drizzle.boolean("is_editable").notNull().default(false),
    isDeletable: drizzle.boolean("is_deletable").notNull().default(false),
    isValidationOverridable: drizzle
      .boolean("is_validation_overridable")
      .notNull()
      .default(false),

    createdAt: drizzle
      .timestamp("created_at", { withTimezone: true })
      .defaultNow(),
    updatedAt: drizzle
      .timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [drizzle.unique().on(t.defaultSectionId, t.name)]
);

export const DefaultFieldsRelations = relations(DefaultFields, (rel) => ({
  industry: rel.one(Industries, {
    fields: [DefaultFields.industryId],
    references: [Industries.id],
  }),
}));
