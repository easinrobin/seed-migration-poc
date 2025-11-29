import * as XLSX from "xlsx";
import * as fs from "fs";
import path from "path";
import { TemplateSchema } from "./seed/validators/templates.validator";
import { IndustrySchema } from "./seed/validators/industry.validator";
import { DefaultFieldsSchema } from "./seed/validators/defaultField.validator";
import * as utilities from "./seed/utils/utils";

// Map sheet name -> { schema, filename }
const ENTITY_MAP: Record<
  string,
  { schema: any; name: string; keyField?: string; inputType?: string }
> = {
  templates: { schema: TemplateSchema, name: "templates", keyField: "id" },
  industries: { schema: IndustrySchema, name: "industries", keyField: "id" },
  defaultFields: {
    schema: DefaultFieldsSchema,
    name: "defaultFields",
    keyField: "id",
  },
};

type RowWithMeta = {
  rowIndex: number;
  raw: Record<string, any>;
  validated?: any;
  environments: string[]; // Changed to array to support multiple environments
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Parse environment cell value - supports:
 * - Comma-separated: "dev, staging, prod"
 * - Semicolon-separated: "dev; staging; prod"
 * - Pipe-separated: "dev | staging | prod"
 */
function parseEnvironments(envValue: any): string[] {
  if (!envValue) return [];

  const envStr = envValue.toString().trim();
  if (envStr === "") return [];

  // Split by comma, semicolon, or pipe
  const envs = envStr
    .split(/[,;|]/)
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => e !== "" && e !== "base");

  return [...new Set<string>(envs)]; // Remove duplicates
}

/**
 * Generates environment-specific JSON files from Excel
 * - seed/seed-data/generated/env-overrides/<env>/<entity>.json
 * - Skips rows without environment selection
 * - Duplicates rows across multiple environments if needed
 */
export function generateFromExcel(
  excelFilePath = path.join(__dirname, "./seed/seed-data/excel/data-seed.xlsx")
) {
  const workbook = XLSX.readFile(excelFilePath);
  const overridesBase = path.join(__dirname, "seed", "seed-data", "generated");

  const errors: string[] = [];
  const warnings: string[] = [];
  const sheetData: Record<string, Record<string, any[]>> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const normalized = utilities.toCamelCase(
      sheetName.trim().replace(/\s+/g, "_")
    );

    if (!ENTITY_MAP[normalized]) {
      console.warn(`Skipping sheet "${sheetName}" (no matching entity map).`);
      continue;
    }

    const { schema } = ENTITY_MAP[normalized];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    const parsedRows: RowWithMeta[] = [];

    // Validate header columns vs schema keys
    const firstRow = rows[0] || {};
    const headerKeys = Object.keys(firstRow);
    const expectedKeys = Object.keys(schema.shape);
    const missing = expectedKeys.filter((k) => !headerKeys.includes(k));

    if (missing.length > 0) {
      errors.push(
        `Sheet "${sheetName}" missing expected columns: ${missing.join(", ")}`
      );
      continue;
    }

    // Validate and parse each row
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];

      // Parse environment column (supports multiple values)
      const envRaw =
        raw["environment"] ||
        raw["Environment"] ||
        raw["env"] ||
        raw["ENVIRONMENT"] ||
        "";

      const environments = parseEnvironments(envRaw);

      // Skip rows without environment selection
      if (environments.length === 0) {
        warnings.push(
          `Sheet "${sheetName}" row ${i + 2}: Skipped (no environment selected)`
        );
        continue;
      }

      // Validate row
      let validated: any = null;
      try {
        const pick: Record<string, any> = {};
        Object.keys(schema.shape).forEach((k) => {
          if (k in raw) pick[k] = raw[k];
        });
        validated = schema.parse(pick);
      } catch (err: any) {
        errors.push(
          `Validation error in sheet "${sheetName}" row ${
            i + 2
          }: ${JSON.stringify(err.errors || err.message)}`
        );
        continue;
      }

      parsedRows.push({
        rowIndex: i + 2,
        raw,
        validated,
        environments,
      });
    }

    // Organize by environment
    const envMap: Record<string, any[]> = {};

    for (const r of parsedRows) {
      const cleanRow = { ...(r.validated ?? r.raw) };

      // Remove environment column from output
      delete cleanRow.environment;
      delete cleanRow.Environment;
      delete cleanRow.env;
      delete cleanRow.ENVIRONMENT;

      // Add this row to each specified environment
      for (const env of r.environments) {
        envMap[env] = envMap[env] || [];
        envMap[env].push(cleanRow);
      }
    }

    sheetData[normalized] = envMap;
  }

  // --- IF ANY ERRORS OCCURRED → ABORT EVERYTHING ---
  if (errors.length > 0) {
    console.error("\n❌ VALIDATION FAILED. NO JSON FILES WERE GENERATED.");
    console.error("------------------------------------------------------");
    errors.forEach((e) => console.error("•", e));
    console.error("------------------------------------------------------\n");
    process.exit(1);
  }

  // Display warnings (non-blocking)
  if (warnings.length > 0) {
    console.warn("\n⚠️  WARNINGS:");
    console.warn("------------------------------------------------------");
    warnings.forEach((w) => console.warn("•", w));
    console.warn("------------------------------------------------------\n");
  }

  // --- WRITE JSON FILES FOR EACH ENVIRONMENT ---
  ensureDir(overridesBase);

  const allEnvironments = new Set<string>();
  Object.values(sheetData).forEach((envMap) => {
    Object.keys(envMap).forEach((env) => allEnvironments.add(env));
  });

  console.log(`\n📦 Found environments: ${[...allEnvironments].join(", ")}\n`);

  for (const key of Object.keys(sheetData)) {
    const envMap = sheetData[key];
    const entityNameRaw = ENTITY_MAP[key].name;
    const entityName = utilities.toCamelCase(entityNameRaw);

    console.log(`📄 Processing sheet: ${entityName}`);

    const envKeys = Object.keys(envMap);
    if (envKeys.length === 0) {
      console.log(`   ⚠️  No valid rows with environment selection found.`);
      continue;
    }

    for (const env of envKeys) {
      const envDir = path.join(overridesBase, env);
      ensureDir(envDir);

      const envPath = path.join(envDir, `${entityName}.json`);
      const envRows = envMap[env];

      fs.writeFileSync(envPath, JSON.stringify(envRows, null, 2), "utf-8");

      console.log(`   ✔ [${env}] ${entityName}.json (${envRows.length} rows)`);
      console.log(`     ↳ ${envPath}`);
    }
  }

  console.log(
    `\n✅ All sheets processed. Environment-specific JSON files generated successfully.`
  );
  return { overridesBase };
}

if (require.main === module) {
  const excelFile = path.join(
    __dirname,
    "seed",
    "seed-data",
    "excel",
    "data-seed.xlsx"
  );

  generateFromExcel(excelFile);
}
