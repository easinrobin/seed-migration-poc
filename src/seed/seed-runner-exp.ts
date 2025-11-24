import { SeedEngine } from "./seedEngine";
import { checksumOfFile, readJsonFile } from "./utils";
import { pgPool } from "../db";
import path from "path";
import { generateUUID } from "./utils";
import "dotenv/config";

// Define seed configuration
type SeedConfig = {
  tableName: string;
  jsonFilePath: string;
  seedMethod: (data: any[]) => Promise<void>;
};

const SEED_CONFIGS: SeedConfig[] = [
  {
    tableName: "Industries",
    jsonFilePath: process.env.INDUSTRY_JSON_FILE_PATH!,
    seedMethod: SeedEngine.seedIndustries.bind(SeedEngine),
  },
  {
    tableName: "Templates",
    jsonFilePath: process.env.TEMPLATE_JSON_FILE_PATH!,
    seedMethod: SeedEngine.seedTemplates.bind(SeedEngine),
  },
  {
    tableName: "DefaultFields",
    jsonFilePath: process.env.DEFAULT_FIELD_JSON_FILE_PATH!,
    seedMethod: SeedEngine.seedDefaultFields.bind(SeedEngine),
  },
];

/**
 * Check if seeding is required by comparing checksums
 */
async function isSeedingRequired(
  fileChecksum: string,
  tableName: string
): Promise<{ required: boolean; currentVersion: number | null }> {
  const client = await pgPool.connect();
  try {
    const res = await client.query({
      text: 'SELECT version, checksum FROM "SeedVersion" WHERE table_name = $1',
      values: [tableName],
    });

    if (res.rowCount && res.rows[0].checksum === fileChecksum) {
      console.log(`   ✓ Checksum match - skipping ${tableName}`);
      return { required: false, currentVersion: res.rows[0].version };
    }

    return {
      required: true,
      currentVersion: res.rowCount ? res.rows[0].version : null,
    };
  } catch (err) {
    console.error(`   ✗ Error checking seed version for ${tableName}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get snapshot of current table state for rollback purposes
 */
async function getTableSnapshot(
  tableName: string
): Promise<Record<string, any>[]> {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`SELECT * FROM "${tableName}"`);
    return res.rows;
  } catch (err) {
    console.warn(`   ⚠ Could not get snapshot for ${tableName}:`, err);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Calculate statistics from seed data
 */
function calculateSeedStats(data: any[]): {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
} {
  const added = data.filter(
    (row) => row.sync === true && row.syncReason === "new"
  ).length;
  const updated = data.filter(
    (row) => row.sync === true && row.syncReason === "modified"
  ).length;
  const skipped = data.filter(
    (row) => row.sync === false && row.syncReason === "unchanged"
  ).length;

  return { addedCount: added, updatedCount: updated, skippedCount: skipped };
}

/**
 * Update SeedVersion and create SeedHistory entry
 */
async function recordSeedExecution(
  tableName: string,
  fileChecksum: string,
  currentVersion: number | null,
  seedData: any[],
  status: "success" | "failed",
  errorInfo?: { message: string; stack?: string }
): Promise<void> {
  const client = await pgPool.connect();
  const environment = process.env.NODE_ENV || "development";
  const newVersion = (currentVersion || 0) + 1;

  try {
    await client.query("BEGIN");

    const stats = calculateSeedStats(seedData);
    const snapshot =
      status === "success" ? await getTableSnapshot(tableName) : [];

    // Get previous checksum for history
    const prevChecksumRes = await client.query({
      text: 'SELECT checksum FROM "SeedVersion" WHERE table_name = $1',
      values: [tableName],
    });
    const previousChecksum = prevChecksumRes.rows[0]?.checksum || null;

    // Insert into SeedHistory (audit trail)
    await client.query({
      text: `INSERT INTO "SeedHistory" (id,
        table_name, version, checksum, previous_checksum, 
        environment, status, changes, snapshot_before, 
        error_message, error_stack
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      values: [
        generateUUID(),
        tableName,
        newVersion,
        fileChecksum,
        previousChecksum,
        environment,
        status,
        JSON.stringify({
          added: seedData.filter((r) => r.syncReason === "new"),
          updated: seedData.filter((r) => r.syncReason === "modified"),
          deleted: [], // Not tracking deletions yet
        }),
        JSON.stringify(snapshot),
        errorInfo?.message || null,
        errorInfo?.stack || null,
      ],
    });

    // Update SeedVersion (current state) - only on success
    if (status === "success") {
      await client.query({
        text: `INSERT INTO "SeedVersion" (id, table_name, version, checksum, environment, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (table_name) 
         DO UPDATE SET 
           version = EXCLUDED.version,
           checksum = EXCLUDED.checksum,
           applied_at = NOW(),
           details = EXCLUDED.details`,
        values: [
          generateUUID(),
          tableName,
          newVersion,
          fileChecksum,
          environment,
          JSON.stringify({
            addedCount: stats.addedCount,
            updatedCount: stats.updatedCount,
            skippedCount: stats.skippedCount,
            changes: seedData
              .filter((r) => r.sync === true)
              .map((r) => ({
                id: r.id,
                action: r.syncReason === "new" ? "insert" : "update",
              })),
          }),
        ],
      });
    }

    await client.query("COMMIT");
    console.log(`   ✓ Seed tracking updated for ${tableName} (v${newVersion})`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(
      `   ✗ Failed to record seed execution for ${tableName}:`,
      err
    );
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process a single seed configuration
 */
async function processSeed(config: SeedConfig): Promise<void> {
  const { tableName, jsonFilePath, seedMethod } = config;
  const fileName = path.basename(jsonFilePath);

  console.log(`\n📦 Processing: ${tableName}`);
  console.log(`   📄 File: ${fileName}`);

  try {
    // Calculate checksum
    const fileChecksum = await checksumOfFile(jsonFilePath);
    console.log(`   🔐 Checksum: ${fileChecksum.substring(0, 12)}...`);

    // Check if seeding is required
    const { required, currentVersion } = await isSeedingRequired(
      fileChecksum,
      tableName
    );

    if (!required) {
      console.log(`   ⏭️  Skipped (no changes detected)`);
      return;
    }

    // Load seed data
    console.log(`   📖 Loading seed data...`);
    const seedData = await readJsonFile(jsonFilePath);
    console.log(`   📊 Loaded ${seedData.length} rows`);

    // Filter only rows that need syncing
    const rowsToSync = seedData.filter((row: any) => row.sync === true);
    console.log(`   🔄 Syncing ${rowsToSync.length} changed rows...`);

    // Execute seed method
    await seedMethod(rowsToSync);
    console.log(`   ✅ Seed operation completed`);

    // Record execution
    await recordSeedExecution(
      tableName,
      fileChecksum,
      currentVersion,
      seedData,
      "success"
    );
  } catch (err: any) {
    console.error(`   ❌ Seed failed for ${tableName}:`, err.message);

    // Record failure in history
    try {
      const fileChecksum = await checksumOfFile(jsonFilePath);
      const seedData = await readJsonFile(jsonFilePath);
      const { currentVersion } = await isSeedingRequired(
        fileChecksum,
        tableName
      );

      await recordSeedExecution(
        tableName,
        fileChecksum,
        currentVersion,
        seedData,
        "failed",
        { message: err.message, stack: err.stack }
      );
    } catch (recordErr) {
      console.error(`   ⚠️  Could not record failure in history:`, recordErr);
    }

    throw err;
  }
}

/**
 * Main seed runner
 */
export async function run() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     Database Seed Operation Started    ║");
  console.log("╚════════════════════════════════════════╝");

  const startTime = Date.now();
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const config of SEED_CONFIGS) {
    try {
      const beforeCount = successCount + skipCount;
      await processSeed(config);
      const afterCount = successCount + skipCount;

      if (afterCount > beforeCount) {
        successCount++;
      } else {
        skipCount++;
      }
    } catch (err) {
      failCount++;
      console.error(`\n⚠️  Continuing with next seed after failure...\n`);
      // Continue with other seeds even if one fails
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║         Seed Operation Summary          ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ⏭️  Skipped:    ${skipCount}`);
  console.log(`   ❌ Failed:     ${failCount}`);
  console.log(`   ⏱️  Duration:   ${duration}s`);
  console.log("");

  if (failCount > 0) {
    console.error("⚠️  Some seeds failed. Check logs above for details.");
    process.exit(1);
  }

  console.log("✨ All seeds completed successfully!");
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error("\n💥 Fatal error during seeding:");
    console.error(err);
    process.exit(1);
  });
}
