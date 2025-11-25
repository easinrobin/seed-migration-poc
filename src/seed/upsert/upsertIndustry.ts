import { db } from "../../db";
import { Industries } from "../../db/schema";
import { eq } from "drizzle-orm";
import { isEqual } from "../utils/utils";

export async function upsertIndustry(item: any) {
  const existing = await db.query.Industries.findFirst({
    where: eq(Industries.id, item.id),
  });

  if (!existing) {
    const [inserted] = await db.insert(Industries).values(item).returning();
    return { type: "insert", record: inserted };
  }

  const { createdAt, updatedAt, ...rest } = existing;

  if (isEqual(rest, item)) {
    return { type: "skipped", record: existing };
  }

  const [updated] = await db
    .update(Industries)
    .set({ ...item, updatedAt: new Date() })
    .where(eq(Industries.id, existing.id))
    .returning();

  return { type: "update", record: updated };
}
