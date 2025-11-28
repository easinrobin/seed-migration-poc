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
import { TableName, TABLE_REGISTRY } from "./config/tableRegistry";

/**
 * Check if seeding is required by comparing checksums
 */
async function isSeedingRequired(
  fileChecksum: string,
  tableName: TableName
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
  tableName: TableName
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
 * Record seed execution into SeedHistory and SeedVersion
 */
async function recordSeedExecution(
  tableName: TableName,
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
 * Load all JSON seed files and prepare batch
 */
async function prepareSeedBatch(env: string): Promise<{
  batch: Record<TableName, any[]>;
  seedInfo: Record<
    TableName,
    {
      filePath: string;
      fileChecksum: string;
      required: boolean;
      currentVersion: number | null;
      snapshotBefore: Record<string, any>[];
    }
  >;
}> {
  const batch: Record<TableName, any[]> = {} as any;
  const seedInfo: any = {};

  for (const tableName of Object.keys(TABLE_REGISTRY) as TableName[]) {
    const config = TABLE_REGISTRY[tableName];
    const filePath = process.env[`${tableName.toUpperCase()}_JSON_FILE_PATH`];

    if (!filePath) continue;

    const fileName = path.basename(filePath!);
    console.log(`   📄 File: ${fileName}`);
    console.log(`\n📦 Preparing seed for ${tableName}`);
    const fileChecksum = await checksumOfFile(filePath);
    console.log(`   🔐 Checksum: ${fileChecksum.substring(0, 12)}...`);

    // Check if seeding is required
    const { required, currentVersion } = await isSeedingRequired(
      fileChecksum,
      tableName
    );

    const snapshotBefore = required ? await getTableSnapshot(tableName) : [];

    if (required) {
      const seedData = await loadWithEnvOverrides(filePath, env);
      batch[tableName] = seedData;
    }

    seedInfo[tableName] = {
      filePath,
      fileChecksum,
      required,
      currentVersion,
      snapshotBefore,
    };
  }

  return { batch, seedInfo };
}

/**
 * Main seed runner
 */
export async function run(env?: string) {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     Database Seed Operation Started    ║");
  console.log("╚════════════════════════════════════════╝");

  const startTime = Date.now();
  const environment = env || process.env.NODE_ENV || "local";

  try {
    const { batch, seedInfo } = await prepareSeedBatch(environment);

    // Run batch seeding with FK ordering
    const results = await SeedEngine.seedBatch(batch);

    // Record execution for each table
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let successCount = 0;
    let skipCount = 0;

    for (const tableName of Object.keys(batch) as TableName[]) {
      const info = seedInfo[tableName];
      const result = results[tableName];

      if (!info.required) {
        skipCount++;
        continue;
      }

      successCount++;

      const stats = result?.stats ?? { inserted: 0, updated: 0, skipped: 0 };
      const changes = result?.changes ?? {
        added: [],
        updated: [],
        deleted: [],
      };

      totalInserted += stats.inserted;
      totalUpdated += stats.updated;
      totalSkipped += stats.skipped;

      await recordSeedExecution(
        tableName,
        info.fileChecksum,
        info.currentVersion,
        stats,
        info.snapshotBefore,
        changes,
        "success"
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n╔════════════════════════════════════════╗");
    console.log("║         Seed Operation Summary          ║");
    console.log("╚════════════════════════════════════════╝");
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⏭️  Skipped:    ${skipCount}`);
    console.log(`   📊 Inserted:   ${totalInserted}`);
    console.log(`   📊 Updated:    ${totalUpdated}`);
    console.log(`   📊 Skipped:    ${totalSkipped}`);
    console.log(`   ⏱️  Duration:   ${duration}s`);

    console.log("\n✨ All seeds completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("\n💥 Fatal error during seeding:");
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("\n💥 Fatal error during seeding:");
    console.error(err);
    process.exit(1);
  });
}
