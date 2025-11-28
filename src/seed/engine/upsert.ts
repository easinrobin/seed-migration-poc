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
  item: any,
  existingRows: any[]
): Promise<RowChange> {
  const { table, uniqueFields } = config;

  const seedPriority = (item.priority?.toUpperCase?.() || "SEED") as
    | "SEED"
    | "DB";

  // 1️⃣ Find the existing row from in-memory rows
  const existing = existingRows.find((row) =>
    uniqueFields.every((key) => row[key] === item[key])
  );

  // 2️⃣ INSERT (not exists)
  if (!existing) {
    const [inserted] = await db.insert(table).values(item).returning();

    // Update in-memory cache to keep consistency
    existingRows.push(inserted);

    return { action: "insert", id: String(inserted.id), data: inserted };
  }

  // 3️⃣ Exists + DB priority → skip
  if (seedPriority === "DB") {
    return { action: "skip", id: existing.id, data: existing };
  }

  // 4️⃣ Compare (ignore metadata)
  const { createdAt, updatedAt, ...existingData } = existing;
  const { priority, ...itemData } = item;

  if (deepCompare(existingData, itemData)) {
    return { action: "skip", id: existing.id, data: existing };
  }

  // 5️⃣ Update record
  const before = existing;
  const [updated] = await db
    .update(table)
    .set({ ...item, updatedAt: new Date() })
    .where(buildWhereClause(table, uniqueFields, item)!)
    .returning();

  // Update in-memory array
  const index = existingRows.findIndex((row) =>
    uniqueFields.every((key) => row[key] === item[key])
  );
  if (index !== -1) existingRows[index] = updated;

  // Identify changed fields
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
