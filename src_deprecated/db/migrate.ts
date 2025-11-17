import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../config/db";

(async () => {
  console.log("🚀 Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations complete");
})();
