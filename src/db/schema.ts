import * as drizzle from "drizzle-orm/pg-core";
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

export const TemplateStatusEnum = drizzle.pgEnum("templates_status", [
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

export const DefaultFields = drizzle.pgTable(
  "defaultField",
  {
    id: drizzle.varchar("id", { length: 25 }).primaryKey().unique().notNull(),
    industryId: drizzle
      .varchar("industry_id", { length: 25 })
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

export const Industries = drizzle.pgTable("industries", {
  id: drizzle.varchar("id", { length: 25 }).primaryKey().unique().notNull(),
  name: drizzle.varchar("name", { length: 64 }).unique().notNull(),
  createdAt: drizzle
    .timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: drizzle
    .timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const IndustriesRelations = relations(Industries, (rel) => ({
  defaultSections: rel.many(DefaultFields),
  industryTemplates: rel.many(Templates),
}));

export const Templates = drizzle.pgTable(
  "template",
  {
    id: drizzle.varchar("id", { length: 25 }).primaryKey().unique().notNull(),
    industryId: drizzle
      .varchar("industry_id", { length: 25 })
      .notNull()
      .references((): drizzle.AnyPgColumn => Industries.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    industryName: drizzle.varchar("industry_name", { length: 255 }).notNull(),
    name: drizzle.varchar("name", { length: 255 }).notNull(),
    status: TemplateStatusEnum("status").notNull().default("draft"),
    minFields: drizzle.integer("min_fields").notNull().default(1),
    maxFields: drizzle.integer("max_fields").notNull().default(300),
    minSectionLevels: drizzle
      .integer("min_section_levels")
      .notNull()
      .default(1),
    maxSectionLevels: drizzle
      .integer("max_section_levels")
      .notNull()
      .default(2),
    minSections: drizzle.integer("min_sections").notNull().default(1),
    maxSections: drizzle.integer("max_sections").notNull().default(20),
    createdAt: drizzle
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: drizzle
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [drizzle.unique().on(t.name, t.industryId)]
);

export const TemplatesRelations = relations(Templates, (rel) => ({
  industry: rel.one(Industries, {
    fields: [Templates.industryId],
    references: [Industries.id],
  }),
}));

export const seed_versions = drizzle.pgTable("seed_versions", {
  key: drizzle.varchar("key", { length: 255 }).primaryKey(),
  checksum: drizzle.varchar("checksum", { length: 255 }).notNull(),
  updated_at: drizzle
    .timestamp("updated_at", { mode: "string" })
    .defaultNow()
    .notNull(),
});
