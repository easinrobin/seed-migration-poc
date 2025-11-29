import { pgPool } from "../../db";
import { generateUUID } from "../utils/utils";
import { ChangeSet } from "../../entities/types";

/**
 * Rollback a single version for a table. If version is not provided, rollback last version.
 *
 * ROLLBACK STRATEGY (NO DELETES, NO SNAPSHOT):
 * - For ADDED rows: Look for the previous version's history to find their prior state
 *   - If found in previous version: Restore via UPDATE
 *   - If not found: Skip (newly added rows remain, cannot delete)
 * - For UPDATED rows: Restore to 'before' state via UPDATE
 * - For DELETED rows: Re-insert them
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

    // Get previous version's history to find prior state of added rows
    const prevVersionRes = await client.query(
      `SELECT changes FROM "SeedHistory" 
       WHERE table_name = $1 AND version < $2 
       ORDER BY version DESC LIMIT 1`,
      [tableName, history.version]
    );

    let previousVersionData: Map<string, any> = new Map();

    if (
      prevVersionRes != null &&
      prevVersionRes?.rowCount &&
      prevVersionRes?.rowCount > 0
    ) {
      const prevChanges: ChangeSet = prevVersionRes.rows[0].changes;

      // Build a map of all rows from previous version
      // Include rows that were added or updated in previous version
      for (const added of prevChanges.added || []) {
        previousVersionData.set(added.id, added.data);
      }
      for (const updated of prevChanges.updated || []) {
        previousVersionData.set(updated.id, updated.after);
      }
    }

    // 2. Apply inverse operations (NO DELETES)

    // 2.1 Handle rows that were ADDED in this version
    for (const added of changes.added) {
      const addedId = added.id;

      // Check if this row existed in previous version
      const previousState = previousVersionData.get(addedId);

      if (previousState) {
        // Row existed before - restore its previous state
        const columns = Object.keys(previousState);
        const values = columns.map((c) => previousState[c]);
        const setPairs = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");

        await client.query(
          `UPDATE "${tableName}" SET ${setPairs} WHERE id = $${
            columns.length + 1
          }`,
          [...values, addedId]
        );

        console.log(`  ↻ Restored previous state for row: ${addedId}`);
      } else {
        // Row didn't exist in previous version - cannot rollback (no delete allowed)
        console.warn(
          `  ⚠️  WARNING: Row ${addedId} was added in this version but didn't exist before.` +
            `\n     Cannot rollback (delete operation not allowed).` +
            `\n     Row will remain in database with current state.`
        );
      }
    }

    // 2.2 Revert UPDATED rows to their 'before' state
    for (const upd of changes.updated) {
      const before = upd.before;
      const columns = Object.keys(before);
      const values = columns.map((c) => before[c]);
      const setPairs = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");

      await client.query(
        `UPDATE "${tableName}" SET ${setPairs} WHERE id = $${
          columns.length + 1
        }`,
        [...values, before.id]
      );

      console.log(`  ↻ Reverted update for row: ${before.id}`);
    }

    // 2.3 Re-insert DELETED rows
    for (const del of changes.deleted) {
      const data = del.data;
      const columns = Object.keys(data);
      const values = columns.map((c) => data[c]);
      const cols = columns.map((c) => `"${c}"`).join(", ");
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const setPairs = columns
        .map((c, i) => `"${c}" = EXCLUDED."${c}"`)
        .join(", ");

      await client.query(
        `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${setPairs}`,
        values
      );

      console.log(`  ✓ Re-inserted deleted row: ${data.id}`);
    }

    // 3. Update SeedVersion to previous (version - 1)
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
        id, table_name, version, checksum, previous_checksum, environment, status, changes, error_message, error_stack
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        generateUUID(),
        tableName,
        (history.version || 0) + 1,
        history.checksum,
        history.previous_checksum,
        history.environment,
        "rolled_back",
        JSON.stringify(changes),
        null,
        null,
      ]
    );

    await client.query("COMMIT");
    console.log(
      `✅ Rollback of ${tableName} version ${history.version} completed successfully.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Rollback failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
