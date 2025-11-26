import { run } from "./seedRunner";
import { pgPool } from "../db";

export async function runSeed(env: string) {
  process.env.NODE_ENV = env;
  console.log(`🌱 Running seed engine (env=${env})`);
  await run();
}

export async function listSeedVersions(tableName: string) {
  const client = await pgPool.connect();

  try {
    console.log(`📜 Fetching version history for: ${tableName}`);

    const res = await client.query({
      text: `SELECT version, checksum, status, applied_at
             FROM "SeedHistory"
             WHERE table_name = $1
             ORDER BY version DESC`,
      values: [tableName],
    });

    if (res.rowCount === 0) {
      console.log(`No history entries found.`);
      return;
    }

    console.log(`\nVersion | Status       | Applied At`);
    console.log(`-------------------------------------------`);

    for (const row of res.rows) {
      console.log(
        `${row.version.toString().padEnd(7)} | ${row.status.padEnd(12)} | ${
          row.applied_at
        }`
      );
    }
    console.log("");
  } catch (err) {
    console.error("Failed to list versions:", err);
  } finally {
    client.release();
  }
}
