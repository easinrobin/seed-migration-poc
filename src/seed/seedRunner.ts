// seed/seedRunner.ts
import { SeedEngine } from "./seedEngine";

export async function run() {
  console.log("---- Seeding Industries ----");
  const industries = await SeedEngine.loadJSON(
    "./src/seed/seed-data/generated/industries.json"
  );
  await SeedEngine.seedIndustries(industries);

  console.log("---- Seeding Templates ----");
  const templates = await SeedEngine.loadJSON(
    "./src/seed/seed-data/generated/templates.json"
  );
  await SeedEngine.seedTemplates(templates);

  console.log("---- Seeding Default Fields ----");
  const defaultFields = await SeedEngine.loadJSON(
    "./src/seed/seed-data/generated/default_fields.json"
  );
  await SeedEngine.seedDefaultFields(defaultFields);

  console.log("✔ Seeding completed!");
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
