import { db } from "../../db";
import { TableConfig } from "../config/tableRegistry";
import { buildWhereClause } from "./buildWhereClause";
import { deepCompare } from "../utils/utils";

export type UpsertResult = {
  type: "insert" | "update" | "skipped";
  record: any;
};

export async function genericUpsert(
  config: TableConfig,
  item: any
): Promise<UpsertResult> {
  const { table, queryTable, uniqueFields } = config;

  const priority = (item.priority?.toUpperCase() || "SEED") as "SEED" | "DB";

  // Prepare WHERE clause
  const where = buildWhereClause(table, uniqueFields, item);

  // Find existing row
  const existing = await queryTable.findFirst({ where });

  // -------- CASE 1: Not exists → INSERT (both SEED & DB)
  if (!existing) {
    const [inserted] = await db.insert(table).values(item).returning();
    return { type: "insert", record: inserted };
  }

  // -------- CASE 2: Exists + priority = DB → SKIP
  if (priority === "DB") {
    return { type: "skipped", record: existing };
  }

  // -------- CASE 3: Exists + SEED priority → compare & update if needed
  if (deepCompare(existing, item)) {
    return { type: "skipped", record: existing };
  }

  const [updated] = await db
    .update(table)
    .set({ ...item, updatedAt: new Date() })
    .where(where!)
    .returning();

  return { type: "update", record: updated };
}
