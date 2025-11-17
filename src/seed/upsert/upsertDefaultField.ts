import { db } from "../../db";
import { DefaultFields } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { isEqual } from "../utils";

export async function upsertDefaultField(item: any) {
  const existing = await db.query.DefaultFields.findFirst({
    where: and(
      eq(DefaultFields.industryId, item.industryId),
      eq(DefaultFields.id, item.id)
    ),
  });

  if (!existing) {
    const [inserted] = await db.insert(DefaultFields).values(item).returning();
    return { type: "insert", record: inserted };
  }

  const { createdAt, updatedAt, ...rest } = existing;

  if (isEqual(rest, item)) {
    return { type: "skipped", record: existing };
  }

  const [updated] = await db
    .update(DefaultFields)
    .set({ ...item, updatedAt: new Date() })
    .where(eq(DefaultFields.id, existing.id))
    .returning();

  return { type: "update", record: updated };
}
