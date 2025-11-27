import { SeedEngine } from "./engine/seedEngine";
import { SeedStats, ChangeSet, SeedResult } from "../entities/types";
import {
  checksumOfFile,
  readJsonFile,
  generateUUID,
  loadWithEnvOverrides,
} from "./utils/utils";
import { pgPool } from "../db";
import path from "path";
import "dotenv/config";

// Define seed configuration
type SeedConfig = {
  tableName: string;
  jsonFilePath: string;
  seedMethod: (data: any[]) => Promise<SeedResult>;
};

const SEED_CONFIGS: SeedConfig[] = [
  {
    tableName: "Industries",
    jsonFilePath: process.env.INDUSTRY_JSON_FILE_PATH!,
    seedMethod: (data) => SeedEngine.seed("Industries", data),
  },
  {
    tableName: "Templates",
    jsonFilePath: process.env.TEMPLATE_JSON_FILE_PATH!,
    seedMethod: (data) => SeedEngine.seed("Templates", data),
  },
  {
    tableName: "DefaultFields",
    jsonFilePath: process.env.DEFAULT_FIELD_JSON_FILE_PATH!,
    seedMethod: (data) => SeedEngine.seed("DefaultFields", data),
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
 * Update SeedVersion and create SeedHistory entry
 */
async function recordSeedExecution(
  tableName: string,
  fileChecksum: string,
  currentVersion: number | null,
  seedStats: SeedStats,
  snapshotBefore: Record<string, any>[],
  changes: ChangeSet,
  status: "success" | "failed" | "rolled_back",
  errorInfo?: { message: string; stack?: string }
): Promise<void> {
  const client = await pgPool.connect();
  const environment = process.env.NODE_ENV || "development";
  const newVersion = (currentVersion || 0) + 1;

  try {
    await client.query("BEGIN");

    // Get previous checksum for history
    const prevChecksumRes = await client.query({
      text: 'SELECT checksum FROM "SeedVersion" WHERE table_name = $1',
      values: [tableName],
    });
    const previousChecksum = prevChecksumRes.rows[0]?.checksum || null;

    // Insert into SeedHistory (audit trail)
    await client.query({
      text: `INSERT INTO "SeedHistory" (
        id, table_name, version, checksum, previous_checksum, 
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
        JSON.stringify(changes),
        JSON.stringify(snapshotBefore),
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
            addedCount: seedStats.inserted,
            updatedCount: seedStats.updated,
            skippedCount: seedStats.skipped,
            changes: {
              added: changes.added.map((c) => c.id),
              updated: changes.updated.map((c) => c.id),
              deleted: changes.deleted.map((c) => c.id),
            },
          }),
        ],
      });
    }

    await client.query("COMMIT");
    console.log(`   ✓ Seed tracking updated for ${tableName} (v${newVersion})`);
    console.log(
      `   📊 Stats: ${seedStats.inserted} inserted, ${seedStats.updated} updated, ${seedStats.skipped} skipped`
    );
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
async function processSeed(
  config: SeedConfig,
  environment: string
): Promise<{
  skipped: boolean;
  stats?: SeedStats;
}> {
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
      return { skipped: true };
    }

    // Take snapshot BEFORE any changes
    console.log(`   📸 Taking snapshot before changes...`);
    const snapshotBefore = await getTableSnapshot(tableName);
    console.log(`   ✓ Snapshot captured (${snapshotBefore.length} rows)`);

    // Load seed data with env overrides
    console.log(`   📖 Loading seed data...`);
    const seedData = await loadWithEnvOverrides(jsonFilePath, environment);
    console.log(`   📊 Loaded ${seedData.length} rows`);

    // Execute seed method (returns stats or void)
    console.log(`   🔄 Executing seed operation...`);
    const result = await seedMethod(seedData);
    console.log(`   ✅ Seed operation completed`);

    // Default stats if method returns void
    const seedStats = result?.stats ?? { inserted: 0, updated: 0, skipped: 0 };
    const changes = result?.changes ?? { added: [], updated: [], deleted: [] };

    // Record execution with snapshot taken BEFORE
    await recordSeedExecution(
      tableName,
      fileChecksum,
      currentVersion,
      seedStats,
      snapshotBefore,
      changes,
      "success"
    );

    return { skipped: false, stats: seedStats };
  } catch (err: any) {
    console.error(`   ❌ Seed failed for ${tableName}:`, err.message);

    // Record failure in history
    try {
      const fileChecksum = await checksumOfFile(jsonFilePath);
      const { currentVersion } = await isSeedingRequired(
        fileChecksum,
        tableName
      );
      const snapshotBefore = await getTableSnapshot(tableName);

      await recordSeedExecution(
        tableName,
        fileChecksum,
        currentVersion,
        { inserted: 0, updated: 0, skipped: 0 },
        snapshotBefore,
        { added: [], updated: [], deleted: [] },
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
export async function run(env?: string) {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     Database Seed Operation Started    ║");
  console.log("╚════════════════════════════════════════╝");

  const startTime = Date.now();
  const environment = env || process.env.NODE_ENV || "development";
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const config of SEED_CONFIGS) {
    try {
      const result = await processSeed(config, environment);

      if (result.skipped) {
        skipCount++;
      } else {
        successCount++;
        if (result.stats) {
          totalInserted += result.stats.inserted;
          totalUpdated += result.stats.updated;
          totalSkipped += result.stats.skipped;
        }
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

  if (successCount > 0) {
    console.log("\n   📈 Operation Details:");
    console.log(`      • Inserted: ${totalInserted}`);
    console.log(`      • Updated:  ${totalUpdated}`);
    console.log(`      • Skipped:  ${totalSkipped}`);
  }
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
