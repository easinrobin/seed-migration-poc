// src/seed/db-seeder-master.ts
import { db } from "../config/db";
import { Industries } from "../db/schema/industries.schema";
import { Templates } from "../db/schema/templates.schema";
import { DefaultFields } from "../db/schema/defaultFields.schema";
import * as fs from "fs";
import path from "path";
import "dotenv/config";

const GENERATED_DIR = path.join(__dirname, "../seed/seed-data/generated");

async function seedAll() {
  console.log("Starting master seed from generated JSON files...");

  // 1. Seed Industries
  const industriesPath = path.join(GENERATED_DIR, "industries.json");
  if (!fs.existsSync(industriesPath)) {
    console.error("industries.json not found!");
    process.exit(1);
  }

  const industries = JSON.parse(fs.readFileSync(industriesPath, "utf8"));
  const insertedIndustries = await db
    .insert(Industries)
    .values(industries)
    .onConflictDoNothing()
    .returning();
  console.log(`Industries: ${insertedIndustries.length} inserted/skipped`);

  // 2. Seed Templates
  const templatesPath = path.join(GENERATED_DIR, "templates.json");
  const templates = JSON.parse(fs.readFileSync(templatesPath, "utf8"));

  const insertedTemplates = await db
    .insert(Templates)
    .values(templates)
    .onConflictDoNothing()
    .returning();
  console.log(`Templates: ${insertedTemplates.length} inserted/skipped`);

  // 3. Seed Default Fields
  const fieldsPath = path.join(GENERATED_DIR, "default_fields.json");
  const defaultFields = JSON.parse(fs.readFileSync(fieldsPath, "utf8"));

  const insertedFields = await db
    .insert(DefaultFields)
    .values(defaultFields)
    .onConflictDoNothing()
    .returning();
  console.log(`Default Fields: ${insertedFields.length} inserted/skipped`);

  console.log("Master seed completed successfully!");
  process.exit(0);
}

seedAll().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
