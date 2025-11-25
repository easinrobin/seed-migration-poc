// seed/seedEngine.ts
import { upsertIndustry } from "./upsert/upsertIndustry";
import { upsertTemplate } from "./upsert/upsertTemplate";
import { upsertDefaultField } from "./upsert/upsertDefaultField";
import { IndustrySchema } from "./validators/industry.validator";
import { TemplateSchema } from "./validators/templates.validator";
import { DefaultFieldsSchema } from "./validators/defaultField.validator";
import fs from "fs/promises";

// ------------ Seed Orchestrator -----------------

export class SeedEngine {
  static async loadJSON(path: string) {
    return JSON.parse(await fs.readFile(path, "utf8"));
  }

  static async seedIndustries(data: any[]) {
    for (const raw of data) {
      const item = IndustrySchema.parse(raw);
      const result = await upsertIndustry(item);
      console.log("Industry:", result.type, result.record.name);
    }
  }

  static async seedTemplates(data: any[]) {
    for (const raw of data) {
      const item = TemplateSchema.parse(raw);
      const result = await upsertTemplate(item);
      console.log("Template:", result.type, result.record.name);
    }
  }

  static async seedDefaultFields(data: any[]) {
    for (const raw of data) {
      const item = DefaultFieldsSchema.parse(raw);
      const result = await upsertDefaultField(item);
      console.log("DefaultField:", result.type, result.record.name);
    }
  }
}
