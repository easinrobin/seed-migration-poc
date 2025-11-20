import * as XLSX from "xlsx";
import * as fs from "fs";
import path from "path";
import { TemplateSchema } from "./seed/validators/templates.validator";
import { IndustrySchema } from "./seed/validators/industry.validator";
import { DefaultFieldsSchema } from "./seed/validators/defaultField.validator";

// Map sheet name -> { schema, filename }
const ENTITY_MAP: Record<
  string,
  { schema: any; name: string; keyField?: string; inputType?: string }
> = {
  templates: { schema: TemplateSchema, name: "templates", keyField: "id" },
  industries: { schema: IndustrySchema, name: "industries", keyField: "id" },
  default_fields: {
    schema: DefaultFieldsSchema,
    name: "default_fields",
    keyField: "id",
  },
};

type RowWithMeta = {
  rowIndex: number;
  raw: Record<string, any>;
  validated?: any;
  environment?: string | null;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Generates:
 * - seed/seed-data/generated/<entity>.json  (base rows)
 * - seed/seed-overrides/<env>/<entity>.json (env rows)
 */
export function generateFromExcel(
  excelFilePath = path.join(__dirname, "./seed/seed-data/excel/data-seed.xlsx"),
  outBase = path.join(__dirname, "seed", "seed-data", "generated")
) {
  const workbook = XLSX.readFile(excelFilePath);
  const overridesBase = path.join(__dirname, "seed", "seed-overrides");

  const errors: string[] = [];
  const sheetData: Record<
    string,
    { baseRows: any[]; envMap: Record<string, any[]> }
  > = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const normalized = sheetName.trim().toLowerCase().replace(/\s+/g, "_");

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

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const envRaw = (
        raw["environment"] ||
        raw["Environment"] ||
        raw["env"] ||
        raw["ENVIRONMENT"] ||
        ""
      )
        .toString()
        .trim();
      const environment = envRaw === "" ? null : envRaw;

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
      }

      parsedRows.push({
        rowIndex: i + 2,
        raw,
        validated,
        environment,
      });
    }

    // Partition only after validation
    const baseRows: any[] = [];
    const envMap: Record<string, any[]> = {};

    for (const r of parsedRows) {
      const cleanRow = { ...(r.validated ?? r.raw) };

      if (!r.environment || r.environment.toLowerCase() === "base") {
        baseRows.push(cleanRow);
      } else {
        const env = r.environment;
        envMap[env] = envMap[env] || [];
        envMap[env].push(cleanRow);
      }
    }

    sheetData[normalized] = { baseRows, envMap };
  }

  // --- IF ANY ERRORS OCCURRED → ABORT EVERYTHING ---
  if (errors.length > 0) {
    console.error("\n❌ VALIDATION FAILED. NO JSON FILES WERE GENERATED.");
    console.error("------------------------------------------------------");
    errors.forEach((e) => console.error("•", e));
    console.error("------------------------------------------------------\n");
    process.exit(1);
  }

  // --- SECOND PASS: WRITE JSON ONLY IF EVERYTHING WAS VALID ---
  ensureDir(outBase);
  ensureDir(overridesBase);

  for (const key of Object.keys(sheetData)) {
    const { baseRows, envMap } = sheetData[key];
    const entityName = ENTITY_MAP[key].name;

    console.log(`\n📄 Processing sheet: ${entityName}`);

    // Base file
    const basePath = path.join(outBase, `${ENTITY_MAP[key].name}.json`);
    fs.writeFileSync(basePath, JSON.stringify(baseRows, null, 2), "utf-8");

    console.log(
      `   ✔ Base JSON written: ${entityName}.json (${baseRows.length} rows)`
    );
    console.log(`     ↳ Path: ${basePath}`);

    // Env overrides
    const envKeys = Object.keys(envMap);
    if (envKeys.length === 0) {
      console.log(`   ✔ No environment overrides found for this sheet.`);
    } else {
      for (const env of Object.keys(envMap)) {
        const envDir = path.join(overridesBase, env);
        ensureDir(envDir);

        const envPath = path.join(envDir, `${ENTITY_MAP[key].name}.json`);
        fs.writeFileSync(
          envPath,
          JSON.stringify(envMap[env], null, 2),
          "utf-8"
        );

        console.log(`   ✔ Env override: [${env}] (${envMap[env].length} rows)`);
        console.log(`     ↳ Path: ${envPath}`);
      }
    }
  }

  console.log(`\n✅ All sheets valid. Seed JSON generated successfully.`);
  return { base: outBase, overridesBase };
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
