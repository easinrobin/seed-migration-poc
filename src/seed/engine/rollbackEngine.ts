import { pgPool } from "../../db";
import { generateUUID } from "../utils/utils";

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

    // 1. Fetch history entry
    let historyRes;
    if (version) {
      historyRes = await client.query(
        `SELECT * FROM "SeedHistory" WHERE table_name = $1 AND version = $2 FOR UPDATE`,
        [tableName, version]
      );
    } else {
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
    const snapshotBefore: Array<Record<string, any>> =
      history.snapshot_before || [];

    if (!Array.isArray(snapshotBefore)) {
      throw new Error(`snapshot_before for ${tableName} is invalid`);
    }

    let updated = 0;
    let inserted = 0;

    // 2. Apply safe rollback per row (OPTIONS 1)
    for (const row of snapshotBefore) {
      const rowId = row.id;
      if (!rowId) continue;

      const existingRes = await client.query(
        `SELECT id FROM "${tableName}" WHERE id = $1 LIMIT 1`,
        [rowId]
      );

      const columns = Object.keys(row);
      const values = columns.map((c) => row[c]);

      if (existingRes.rowCount != null && existingRes.rowCount > 0) {
        // UPDATE existing row
        const setClause = columns
          .map((c, idx) => `"${c}" = $${idx + 1}`)
          .join(", ");

        await client.query(
          `UPDATE "${tableName}" SET ${setClause} WHERE id = $${
            columns.length + 1
          }`,
          [...values, rowId]
        );

        updated++;
      } else {
        // INSERT missing row
        const colNames = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

        await client.query(
          `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
          values
        );

        inserted++;
      }
    }

    // 3. Calculate new SeedVersion (previous version)
    const prevRes = await client.query(
      `SELECT version FROM "SeedHistory" 
       WHERE table_name = $1 AND version < $2 
       ORDER BY version DESC LIMIT 1`,
      [tableName, history.version]
    );

    const prevVersion = prevRes.rowCount ? prevRes.rows[0].version : null;

    const targetVersion = prevVersion ?? 0;

    // 4. Write SeedVersion entry
    if (targetVersion === 0) {
      await client.query(`DELETE FROM "SeedVersion" WHERE table_name = $1`, [
        tableName,
      ]);
    } else {
      const prevChecksumRes = await client.query(
        `SELECT checksum FROM "SeedHistory" WHERE table_name = $1 AND version = $2`,
        [tableName, targetVersion]
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
          targetVersion,
          prevChecksum,
          history.environment,
          JSON.stringify({ rolledBackTo: targetVersion }),
        ]
      );
    }

    // 5. Log rollback event in SeedHistory
    await client.query(
      `INSERT INTO "SeedHistory" (
        id, table_name, version, checksum, previous_checksum, environment, 
        status, changes, snapshot_before, error_message, error_stack
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        generateUUID(),
        tableName,
        history.version + 1,
        history.checksum,
        history.previousChecksum,
        history.environment,
        "rolled_back",
        JSON.stringify({}), // Not used anymore
        JSON.stringify(snapshotBefore),
        null,
        null,
      ]
    );

    await client.query("COMMIT");

    console.log(`Rollback complete for ${tableName}`);
    console.log(` → Updated rows: ${updated}`);
    console.log(` → Inserted rows: ${inserted}`);
    console.log(` → Rows not in snapshot_before: untouched`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Rollback failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
