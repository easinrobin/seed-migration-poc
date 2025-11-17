import { db } from "../../db";
import { Templates } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { isEqual } from "../utils";

export async function upsertTemplate(item: any) {
  const existing = await db.query.Templates.findFirst({
    where: and(
      eq(Templates.industryId, item.industryId),
      eq(Templates.id, item.id)
    ),
  });

  if (!existing) {
    const [inserted] = await db.insert(Templates).values(item).returning();
    return { type: "insert", record: inserted };
  }

  const { createdAt, updatedAt, ...rest } = existing;

  if (isEqual(rest, item)) {
    return { type: "skipped", record: existing };
  }

  const [updated] = await db
    .update(Templates)
    .set({ ...item, updatedAt: new Date() })
    .where(eq(Templates.id, existing.id))
    .returning();

  return { type: "update", record: updated };
}
