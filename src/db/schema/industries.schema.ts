import { relations } from "drizzle-orm";
import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { DefaultFields } from "./defaultFields.schema";
import { Templates } from "./templates.schema";

export const Industries = pgTable("industries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const IndustriesRelations = relations(Industries, (rel) => ({
  defaultSections: rel.many(DefaultFields),
  industryTemplates: rel.many(Templates),
}));
