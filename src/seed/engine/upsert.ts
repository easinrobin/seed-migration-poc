import { db } from "../../db";
import { TableConfig } from "../config/tableRegistry";
import { buildWhereClause } from "./buildWhereClause";
import { deepCompare } from "../utils/utils";

export type RowChange =
  | { action: "insert"; id: string; data: Record<string, any> }
  | { action: "skip"; id: string; data: Record<string, any> }
  | {
      action: "update";
      id: string;
      before: Record<string, any>;
      after: Record<string, any>;
      changedFields: string[];
    };

export async function genericUpsertWithChanges(
  config: TableConfig,
  item: any
): Promise<RowChange> {
  const { table, queryTable, uniqueFields } = config;
  const priority = (item.priority?.toUpperCase?.() || "SEED") as "SEED" | "DB";

  // Prepare WHERE clause
  const where = buildWhereClause(table, uniqueFields, item);

  // Find existing row
  const existing = await queryTable.findFirst({ where });

  // -------- CASE 1: Not exists → INSERT (both SEED & DB)
  if (!existing) {
    const [inserted] = await db.insert(table).values(item).returning();
    return { action: "insert", id: String(inserted.id), data: inserted };
  }

  // -------- CASE 2: Exists + priority = DB → SKIP
  if (priority === "DB") {
    return { action: "skip", id: existing.id, data: existing };
  }

  // -------- CASE 3: Exists + SEED priority → compare & update if needed
  const { createdAt, updatedAt, ...existingData } = existing;
  if (deepCompare(existingData, item)) {
    return { action: "skip", id: existing.id, data: existing };
  }

  const before = existing;
  const [updated] = await db
    .update(table)
    .set({ ...item, updatedAt: new Date() })
    .where(where!)
    .returning();

  // compute changed fields
  const changedFields = Object.keys(item).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(item[k])
  );

  return {
    action: "update",
    id: String(updated.id),
    before,
    after: updated,
    changedFields,
  };
}
