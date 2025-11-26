#!/usr/bin/env node
import { runSeed, listSeedVersions } from "./seed/commands";
import { rollbackTableVersion } from "./seed/engine/rollbackEngine";

const args = process.argv.slice(2);

async function main() {
  const cmd = args[0];

  switch (cmd) {
    case "runSeed": {
      const env = args[1] || process.env.NODE_ENV || "development";
      await runSeed(env);
      break;
    }

    case "rollbackSeed": {
      const tableName = args[1];
      const version = Number(args[2]);

      if (!tableName || !version) {
        console.error("Usage: seed rollback <tableName> <version>");
        process.exit(1);
      }

      await rollbackTableVersion(tableName, version);
      break;
    }

    case "listSeedVersions": {
      const tableName = args[1];
      if (!tableName) {
        console.error("Usage: seed list <tableName>");
        process.exit(1);
      }

      await listSeedVersions(tableName);
      break;
    }

    default:
      console.log(`
Usage:
  seed runSeed                              Run all seeds
  seed rollbackSeed <table> <version>       Rollback table to version
  seed listSeedVersions <table>             List history versions for table

Examples:
  seed runSeed
  seed rollbackSeed Industries 2
  seed listSeedVersions Templates
`);
      process.exit(0);
  }
}

main().catch((err) => {
  console.error("CLI failed:", err);
  process.exit(1);
});
