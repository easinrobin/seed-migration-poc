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

type SyncableRow = {
  sync: boolean;
  syncReason?: "new" | "modified" | "unchanged";
  [key: string]: any;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Compare new rows against existing JSON and mark sync status
 */
function compareAndMarkSync(
  newRows: any[],
  existingJsonPath: string,
  keyField: string = "id"
): SyncableRow[] {
  // If file doesn't exist, mark all as sync: true (new)
  if (!fs.existsSync(existingJsonPath)) {
    console.log(`     ℹ No existing file found. Marking all rows as new.`);
    return newRows.map((row) => ({
      ...row,
      sync: true,
      syncReason: "new" as const,
    }));
  }

  // Load existing data
  let existingData: any[] = [];
  try {
    const fileContent = fs.readFileSync(existingJsonPath, "utf-8");
    existingData = JSON.parse(fileContent);
  } catch (err) {
    console.warn(
      `     ⚠ Could not parse existing file. Treating all rows as new.`
    );
    return newRows.map((row) => ({
      ...row,
      sync: true,
      syncReason: "new" as const,
    }));
  }

  // Create map of existing rows by keyField
  const existingMap = new Map<any, any>();
  for (const row of existingData) {
    const key = row[keyField];
    if (key !== undefined && key !== null) {
      existingMap.set(key, row);
    }
  }

  // Compare and mark each new row
  const syncStats = { new: 0, modified: 0, unchanged: 0 };

  const result = newRows.map((newRow) => {
    const keyValue = newRow[keyField];
    const existing = existingMap.get(keyValue);

    if (!existing) {
      syncStats.new++;
      return {
        ...newRow,
        sync: true,
        syncReason: "new" as const,
      };
    }

    // Deep comparison (excluding sync metadata)
    const hasChanged = Object.keys(newRow).some((key) => {
      if (key === "sync" || key === "syncReason") return false;

      // Handle undefined/null equivalence
      const newVal = newRow[key];
      const oldVal = existing[key];

      if (newVal === oldVal) return false;
      if (newVal == null && oldVal == null) return false;

      // Deep comparison using JSON serialization
      return JSON.stringify(newVal) !== JSON.stringify(oldVal);
    });

    if (hasChanged) {
      syncStats.modified++;
      return {
        ...newRow,
        sync: true,
        syncReason: "modified" as const,
      };
    }

    syncStats.unchanged++;
    return {
      ...newRow,
      sync: false,
      syncReason: "unchanged" as const,
    };
  });

  console.log(
    `     📊 Sync stats: ${syncStats.new} new, ${syncStats.modified} modified, ${syncStats.unchanged} unchanged`
  );

  return result;
}

/**
 * Generates:
 * - seed/seed-data/generated/<entity>.json  (base rows)
 * - seed/seed-overrides/<env>/<entity>.json (env rows)
 * With sync tracking enabled
 */
export function generateFromExcel(
  excelFilePath = path.join(__dirname, "./seed/seed-data/excel/data-seed.xlsx"),
  outBase = path.join(__dirname, "seed", "seed-data", "generated"),
  enableSyncTracking = true
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
    const keyField = ENTITY_MAP[key].keyField || "id";

    console.log(`\n📄 Processing sheet: ${entityName}`);

    // Base file with sync tracking
    const basePath = path.join(outBase, `${ENTITY_MAP[key].name}.json`);
    let finalBaseRows = baseRows;

    if (enableSyncTracking) {
      console.log(`   🔍 Comparing with existing file...`);
      finalBaseRows = compareAndMarkSync(baseRows, basePath, keyField);
    }

    fs.writeFileSync(basePath, JSON.stringify(finalBaseRows, null, 2), "utf-8");

    console.log(
      `   ✔ Base JSON written: ${entityName}.json (${finalBaseRows.length} rows)`
    );
    console.log(`     ↳ Path: ${basePath}`);

    // Env overrides with sync tracking
    const envKeys = Object.keys(envMap);
    if (envKeys.length === 0) {
      console.log(`   ✔ No environment overrides found for this sheet.`);
    } else {
      for (const env of Object.keys(envMap)) {
        const envDir = path.join(overridesBase, env);
        ensureDir(envDir);

        const envPath = path.join(envDir, `${ENTITY_MAP[key].name}.json`);
        let finalEnvRows = envMap[env];

        if (enableSyncTracking) {
          console.log(`   🔍 Comparing env [${env}] with existing file...`);
          finalEnvRows = compareAndMarkSync(envMap[env], envPath, keyField);
        }

        fs.writeFileSync(
          envPath,
          JSON.stringify(finalEnvRows, null, 2),
          "utf-8"
        );

        console.log(
          `   ✔ Env override: [${env}] (${finalEnvRows.length} rows)`
        );
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

  // You can disable sync tracking by passing false as third argument
  // generateFromExcel(excelFile, undefined, false);
  generateFromExcel(excelFile);
}
