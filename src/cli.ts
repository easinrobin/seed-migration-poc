// #!/usr/bin/env node
// import { run } from "./seed/seedRunner";

// // const env = process.argv[2] || process.env.SEED_ENV || undefined;

// // (async () => {
// //   try {
// //     await run();
// //     process.exit(0);
// //   } catch (err: any) {
// //     console.error("Seed engine failed:", err);
// //     process.exit(1);
// //   }
// // })();

// async function dbSeed() {
//   try {
//     await run();
//     process.exit(0);
//   } catch (err: any) {
//     console.error("Seed engine failed:", err);
//     process.exit(1);
//   }
// }

// if (require.main === module) {
//   dbSeed().catch((err) => {
//     console.error(err.message);
//     process.exit(1);
//   });
// }
