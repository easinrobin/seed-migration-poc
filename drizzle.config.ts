import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations/drizzle",
  dbCredentials: {
    url: process.env.POSTGRES_DB_URI!,
  },
  verbose: true,
  strict: true,
  migrations: {
    prefix: "timestamp",
  },
});
