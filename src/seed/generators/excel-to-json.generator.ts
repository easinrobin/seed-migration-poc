import * as XLSX from "xlsx";
import * as fs from "fs";
import path from "path";
import {
  TemplateSchema,
  TemplateInput,
} from "../validators/templates.validator";
import {
  IndustrySchema,
  IndustryInput,
} from "../validators/industry.validator";
import {
  DefaultFieldsSchema,
  DefaultFieldsInput,
} from "../validators/defaultField.validator";

const EXCEL_PATH = path.join(__dirname, "../seed-data/excel/data-seed.xlsx");
const OUTPUT_DIR = path.join(__dirname, "../seed-data/generated");

interface SheetConfig<T> {
  name: string;
  schema: any;
  requiredColumns?: string[];
  transform?: (row: any, context: any) => T | null;
}

function validateColumns(sheet: XLSX.Sheet, expected: string[]) {
  const headers = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })[0];

  const missing = expected.filter((col) => !headers.includes(col));

  if (missing.length > 0) {
    throw new Error(
      `Sheet "${sheet.name}" is missing columns: ${missing.join(", ")}`
    );
  }
}

async function generateMasterSeed() {
  console.log("Reading master Excel:", EXCEL_PATH);
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const errors: string[] = [];

  // Ensure output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Industries
  const industriesSheet = workbook.Sheets["industries"];
  if (!industriesSheet) throw new Error("Missing sheet: industries");

  validateColumns(industriesSheet, ["name"]);
  const rawIndustries = XLSX.utils.sheet_to_json(industriesSheet);
  const industries: IndustryInput[] = [];

  rawIndustries.forEach((row: any, i) => {
    const result = IndustrySchema.safeParse(row);
    if (!result.success) {
      errors.push(
        `[industries] Row ${i + 2}: ${result.error.issues
          .map((e) => e.message)
          .join("; ")}`
      );
    } else {
      industries.push(result.data);
    }
  });

  // Step 2: Templates (needs industry name → id mapping)
  const templatesSheet = workbook.Sheets["templates"];
  if (!templatesSheet) throw new Error("Missing sheet: templates");

  const industryNameToId = Object.fromEntries(
    industries.map((ind, i) => [ind.name.trim().toLowerCase(), i + 1]) // assuming serial starts at 1
  );

  validateColumns(templatesSheet, ["industryName", "name"]);
  const rawTemplates = XLSX.utils.sheet_to_json(templatesSheet);
  const templates: (TemplateInput & { industryId: number })[] = [];

  rawTemplates.forEach((row: any, i) => {
    const industryName = row.industryName?.trim().toLowerCase();
    const industryId = industryNameToId[industryName];

    if (!industryId) {
      errors.push(
        `[templates] Row ${i + 2}: Unknown industryName "${row.industryName}"`
      );
      return;
    }

    const parsed = TemplateSchema.safeParse({
      ...row,
      industryId,
    });

    if (!parsed.success) {
      errors.push(
        `[templates] Row ${i + 2}: ${parsed.error.issues
          .map((e) => e.message)
          .join("; ")}`
      );
    } else {
      templates.push(parsed.data);
    }
  });

  // Step 3: Default Fields
  const fieldsSheet = workbook.Sheets["default_fields"];
  if (!fieldsSheet) throw new Error("Missing sheet: default_fields");

  const rawFields = XLSX.utils.sheet_to_json(fieldsSheet);
  const defaultFields: DefaultFieldsInput[] = [];

  rawFields.forEach((row: any, i) => {
    const parsed = DefaultFieldsSchema.safeParse({
      ...row,
    });

    if (!parsed.success) {
      errors.push(
        `[default_fields] Row ${i + 2}: ${parsed.error.issues
          .map((e) => e.message)
          .join("; ")}`
      );
    } else {
      defaultFields.push({ ...parsed.data });
    }
  });

  // Final: Fail fast if any error
  if (errors.length > 0) {
    console.error("Validation FAILED:");
    errors.forEach((e) => console.error("  •", e));
    process.exit(1);
  }

  // Write all JSON files
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "industries.json"),
    JSON.stringify(industries, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "templates.json"),
    JSON.stringify(templates, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "default_fields.json"),
    JSON.stringify(defaultFields, null, 2)
  );

  console.log("All seed files generated successfully in /seed-data/generated/");
  console.log(`   • ${industries.length} industries`);
  console.log(`   • ${templates.length} templates`);
  console.log(`   • ${defaultFields.length} default fields`);
}

if (require.main === module) {
  generateMasterSeed().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
