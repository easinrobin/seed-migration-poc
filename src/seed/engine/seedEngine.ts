import { TableName, getTableConfig } from "../config/tableRegistry";
import { genericUpsertWithChanges } from "./upsert";
import { SeedStats, ChangeSet, SeedResult } from "../../entities/types";
import { buildDependencyGraph, topologicalSort } from "../utils/utils";

export class SeedEngine {
  /**
   * Run seed for a single table
   */
  static async seed(tableName: TableName, rows: any[]): Promise<SeedResult> {
    const config = getTableConfig(tableName);

    const stats: SeedStats = { inserted: 0, updated: 0, skipped: 0 };
    const changes: ChangeSet = { added: [], updated: [], deleted: [] };

    // Load all existing rows ONCE
    const existingRows = await config.loadAll();

    for (const raw of rows) {
      try {
        // 1. Validate using zod schema
        const item = config.schema.parse(raw);

        // 2. Run upsert logic
        const rowChange = await genericUpsertWithChanges(
          config,
          item,
          existingRows
        );

        // 3. Update stats
        if (rowChange.action === "insert") {
          stats.inserted++;
          changes.added.push({ id: rowChange.id, data: rowChange.data });
        } else if (rowChange.action === "skip") {
          stats.skipped++;
        } else if (rowChange.action === "update") {
          stats.updated++;
          changes.updated.push({
            id: rowChange.id,
            before: rowChange.before,
            after: rowChange.after,
            changedFields: rowChange.changedFields,
          });
        }
      } catch (err: any) {
        console.error(`❌ Validation/Upsert error for ${tableName}`);
        console.error(`   ${err.message}`);
        console.error(`   Data: ${JSON.stringify(raw, null, 2)}`);
        throw err;
      }
    }

    return { stats, changes };
  }

  /**
   * Seed multiple tables in sequence
   */
  static async seedBatch(
    batch: Record<TableName, any[]>
  ): Promise<Record<TableName, SeedResult>> {
    const graph = buildDependencyGraph();
    const order = topologicalSort(graph);

    console.log("🔁 Seed Order:", order.join(" → "));

    const results: Record<TableName, SeedResult> = {} as any;

    for (const tableName of order) {
      if (!batch[tableName]) continue;
      console.log(`\n▶ Seeding ${tableName}...`);
      const result = await SeedEngine.seed(tableName, batch[tableName]);
      results[tableName] = result;
    }

    return results;
  }
}
