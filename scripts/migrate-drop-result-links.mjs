/**
 * Drops the public result-link columns.
 *
 *   npm run db:drop-result-links
 *
 * The patient-facing QR feature — a printed code that opened a result page
 * behind a four-digit phone check — has been removed. The two columns that
 * backed it are dropped here so the table stops carrying live access tokens
 * for a door that no longer exists.
 *
 * Guarded with IF EXISTS, so it is safe to run repeatedly and safe against a
 * database that never had them.
 *
 * Note this is the one irreversible step in the removal: once dropped, any
 * blank already printed with a QR code is permanently dead. That is the
 * intended outcome — leaving the tokens in place would mean the feature was
 * only hidden, not removed.
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — nothing to load
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL topilmadi. Mahalliy JSON store o'zi yangilanadi.");
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async (label, sqlText) => {
  await pool.query(sqlText);
  console.log(`  ok  ${label}`);
};

console.log("Ustunlar o'chirilmoqda:");
await run("orders.result_token", `ALTER TABLE orders DROP COLUMN IF EXISTS result_token`);
await run("orders.result_token_at", `ALTER TABLE orders DROP COLUMN IF EXISTS result_token_at`);

await pool.end();
console.log("\nTayyor — bemorga QR havola berish butunlay o'chirildi.");
