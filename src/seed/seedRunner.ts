import { SeedEngine } from "./seedEngine";
import { checksumOfFile, readJsonFile, readFileName } from "./utils";
import { pgPool } from "../db";
import "dotenv/config";

async function isSeedingRequired(
  fileChecksum: string,
  fileName: string
): Promise<boolean> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    // check seed_versions for checksum
    const res = await client.query(
      "SELECT checksum FROM seed_versions WHERE key = $1",
      [fileName]
    );
    if (res.rowCount && res.rows[0].checksum === fileChecksum) {
      console.log("industries.json unchanged — skipping");
      await client.query("COMMIT");
      return false;
    }

    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateSeedVersion(
  fileChecksum: string,
  fileName: string
): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO seed_versions(key, checksum, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET checksum = EXCLUDED.checksum, updated_at = EXCLUDED.updated_at`,
      [fileName, fileChecksum]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function run() {
  console.log("---- Seeding Industries ----");
  // create file content hash
  const industryChecksum = await checksumOfFile(
    process.env.INDUSTRY_JSON_FILE_PATH!
  );
  const industryFileName = readFileName(process.env.INDUSTRY_JSON_FILE_PATH!);
  const indSeedingRequired = await isSeedingRequired(
    industryChecksum,
    industryFileName
  );
  if (indSeedingRequired) {
    const industries = await readJsonFile(process.env.INDUSTRY_JSON_FILE_PATH!);
    await SeedEngine.seedIndustries(industries);

    await updateSeedVersion(industryChecksum, industryFileName);
  }

  console.log("---- Seeding Templates ----");
  // create file content hash
  const templateHash = await checksumOfFile(
    process.env.TEMPLATE_JSON_FILE_PATH!
  );
  const templateFileName = readFileName(process.env.TEMPLATE_JSON_FILE_PATH!);
  const tempSeedingRequired = await isSeedingRequired(
    templateHash,
    templateFileName
  );

  if (tempSeedingRequired) {
    const templates = await readJsonFile(process.env.TEMPLATE_JSON_FILE_PATH!);
    await SeedEngine.seedTemplates(templates);

    await updateSeedVersion(templateHash, templateFileName);
  }

  console.log("---- Seeding Default Fields ----");
  // create file content hash
  const defFieldContentHash = await checksumOfFile(
    process.env.DEFAULT_FIELD_JSON_FILE_PATH!
  );
  const defFieldJsonFileName = readFileName(
    process.env.DEFAULT_FIELD_JSON_FILE_PATH!
  );
  const defFieldSeedingRequired = await isSeedingRequired(
    defFieldContentHash,
    defFieldJsonFileName
  );

  if (defFieldSeedingRequired) {
    const defaultFields = await readJsonFile(
      process.env.DEFAULT_FIELD_JSON_FILE_PATH!
    );
    await SeedEngine.seedDefaultFields(defaultFields);

    await updateSeedVersion(defFieldContentHash, defFieldJsonFileName);
  }

  console.log("✔ Seeding completed!");
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
