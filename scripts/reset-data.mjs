/**
 * Clears operational data (patients, orders, results) from the configured
 * database while keeping the test price list, staff accounts and lab settings.
 *
 *   node scripts/reset-data.mjs          # ask nothing, just clear
 *   node scripts/reset-data.mjs --all    # also clear tests, users and settings
 *
 * Pass --all only when you want a genuinely empty database; the next server
 * start will re-seed the catalogue and the default accounts.
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — nothing to load
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL topilmadi. Mahalliy JSON uchun .data/db.json faylini o'chiring.");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const wipeAll = process.argv.includes("--all");

// order_tests first: it references orders.
const tables = wipeAll
  ? ["order_tests", "orders", "patients", "tests", "users", "lab_settings"]
  : ["order_tests", "orders", "patients"];

for (const table of tables) {
  const { rowCount } = await pool.query(`DELETE FROM "${table}"`);
  console.log(`${table.padEnd(14)} ${rowCount} qator o'chirildi`);
}

// Restart the human-facing sequences so numbering starts from the top again.
await pool.query(`ALTER TABLE orders ALTER COLUMN order_number RESTART WITH 1001`);
console.log("buyurtma raqami 1001 dan qayta boshlanadi");

await pool.query(`ALTER TABLE patients ALTER COLUMN patient_number RESTART WITH 1`);
console.log("bemor raqami 1 dan qayta boshlanadi");

await pool.end();
