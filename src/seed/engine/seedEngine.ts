import { TableName, getTableConfig } from "../config/tableRegistry";
import { genericUpsert } from "./upsert";

export type SeedStats = { insert: number; update: number; skipped: number };

export class SeedEngine {
  /**
   * Run seed for a single table
   */
  static async seed(tableName: TableName, rows: any[]): Promise<SeedStats> {
    const config = getTableConfig(tableName);
    const displayField = config.displayField || "name";

    const stats: SeedStats = { insert: 0, update: 0, skipped: 0 };

    for (const raw of rows) {
      try {
        // 1. Validate using zod schema
        const item = config.schema.parse(raw);

        // 2. Run upsert logic
        const result = await genericUpsert(config, item);

        // 3. Update stats
        stats[result.type]++;
      } catch (err: any) {
        console.error(`❌ Validation/Upsert error for ${tableName}`);
        console.error(`   ${err.message}`);
        console.error(`   Data: ${JSON.stringify(raw, null, 2)}`);
        throw err;
      }
    }

    return stats;
  }

  /**
   * Seed multiple tables in sequence
   */
  static async seedBatch(batch: Record<TableName, any[]>) {
    for (const tableName of Object.keys(batch) as TableName[]) {
      console.log(`\n▶ Seeding ${tableName}...`);
      await SeedEngine.seed(tableName, batch[tableName]);
    }
  }
}
