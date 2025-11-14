import * as drizzle from "drizzle-orm/pg-core";
import { Industries } from "./industries.schema";
import { relations } from "drizzle-orm";

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

export const Templates = drizzle.pgTable(
  "template",
  {
    id: drizzle.serial("id").primaryKey(),
    industryId: drizzle
      .integer("industry_id")
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
