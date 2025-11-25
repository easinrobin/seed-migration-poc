// seed/engine/buildWhere.ts
import { eq, and, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

export function buildWhereClause(
  table: PgTable,
  uniqueFields: readonly string[],
  item: any
): SQL | undefined {
  if (!uniqueFields.length) return undefined;

  const conditions = uniqueFields.map((field) => {
    //@ts-ignore
    return eq(table[field], item[field]);
  });

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}
