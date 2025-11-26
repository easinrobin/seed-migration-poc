// seed/engine/rollbackEngine.ts
import { pgPool } from "../../db";
import { generateUUID } from "../utils/utils";
import { ChangeSet } from "../../entities/types";

/**
 * Rollback a single version for a table. If version is not provided, rollback last version.
 */
export async function rollbackTableVersion(
  tableName: string,
  version?: number
): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get target seed history record
    let historyRes;
    if (version) {
      historyRes = await client.query(
        `SELECT * FROM "SeedHistory" WHERE table_name = $1 AND version = $2 FOR UPDATE`,
        [tableName, version]
      );
    } else {
      // latest
      historyRes = await client.query(
        `SELECT * FROM "SeedHistory" WHERE table_name = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [tableName]
      );
    }

    if (historyRes.rowCount === 0) {
      throw new Error(
        `No seed history found for ${tableName} version ${version ?? "latest"}`
      );
    }

    const history = historyRes.rows[0];
    const changes: ChangeSet = history.changes;

    // 2. Apply inverse operations
    // Order: DELETE rows that were ADDED, then UPDATE rows back to 'before', then INSERT rows that were deleted.
    // Deleting added rows first avoids FK constraint issues in many simple cases.
    // Note: For multi-table rollbacks you must rollback in reverse dependency order across tables.

    // 2.1 Delete rows that were added by this seed
    for (const added of changes.added) {
      // assume 'id' exists and is primary key
      await client.query(`DELETE FROM "${tableName}" WHERE id = $1`, [
        added.id,
      ]);
    }

    // 2.2 Revert updates
    for (const upd of changes.updated) {
      // Use all columns in 'before' to replace row
      const before = upd.before;
      const columns = Object.keys(before);
      const values = columns.map((c) => before[c]);
      const setPairs = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");

      // If PK column is not "id", we rely on it being included in before (e.g., id).
      // Use id value at end for WHERE clause
      await client.query(
        `UPDATE "${tableName}" SET ${setPairs} WHERE id = $${
          columns.length + 1
        }`,
        [...values, before.id]
      );
    }

    // 2.3 Re-insert deleted rows
    for (const del of changes.deleted) {
      const data = del.data;
      const columns = Object.keys(data);
      const values = columns.map((c) => data[c]);
      const cols = columns.map((c) => `"${c}"`).join(", ");
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

      await client.query(
        `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`,
        values
      );
    }

    // 3. Update SeedVersion to previous (version - 1)
    // Find previous version
    const prevRes = await client.query(
      `SELECT version FROM "SeedHistory" WHERE table_name = $1 AND version < $2 ORDER BY version DESC LIMIT 1`,
      [tableName, history.version]
    );
    const prevVersion = prevRes.rowCount ? prevRes.rows[0].version : null;

    const newVersionForSeedVersion = prevVersion ?? 0;

    // Update SeedVersion row
    if (newVersionForSeedVersion === 0) {
      // No prior version; delete SeedVersion row
      await client.query(`DELETE FROM "SeedVersion" WHERE table_name = $1`, [
        tableName,
      ]);
    } else {
      // get checksum of previous version
      const prevChecksumRes = await client.query(
        `SELECT checksum FROM "SeedHistory" WHERE table_name = $1 AND version = $2`,
        [tableName, newVersionForSeedVersion]
      );
      const prevChecksum = prevChecksumRes.rows[0]?.checksum ?? null;

      await client.query(
        `INSERT INTO "SeedVersion" (id, table_name, version, checksum, environment, details)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (table_name)
          DO UPDATE SET version = EXCLUDED.version, checksum = EXCLUDED.checksum, applied_at = NOW(), details = EXCLUDED.details`,
        [
          generateUUID(),
          tableName,
          newVersionForSeedVersion,
          prevChecksum,
          history.environment,
          JSON.stringify({ rolledBackTo: newVersionForSeedVersion }),
        ]
      );
    }

    // 4. Write a SeedHistory entry documenting the rollback action
    await client.query(
      `INSERT INTO "SeedHistory" (
        id, table_name, version, checksum, previous_checksum, environment, status, changes, snapshot_before, error_message, error_stack
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        generateUUID(),
        tableName,
        (history.version || 0) + 1, // new history entry version id for rollback event (documentational)
        history.checksum,
        history.previousChecksum,
        history.environment,
        "rolled_back",
        JSON.stringify(changes),
        JSON.stringify(history.snapshotBefore || []),
        null,
        null,
      ]
    );

    await client.query("COMMIT");
    console.log(
      `Rollback of ${tableName} version ${history.version} completed.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Rollback failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
