/**
 * Adds the samples table and gives every existing order a tube.
 *
 *   npm run db:samples
 *
 * Guarded throughout (IF NOT EXISTS, plus a NOT EXISTS on the backfill), so it
 * is safe to run repeatedly and safe against a fresh database.
 *
 * The backfill is the part worth explaining. Orders created before this
 * release have no sample, and the app renders that as "no tracking on this
 * one" rather than as an error — so doing nothing would also have worked. It
 * backfills anyway, for two reasons:
 *
 *   - a barcode can then be printed for a tube already on the bench, which is
 *     what the lab needs on the morning it switches over;
 *   - the historic rows land in a status that tells the truth. A completed
 *     order's tube was demonstrably drawn and run, so it is recorded as
 *     accepted; anything still open is left as "kutilmoqda", because nobody
 *     can now say whether that tube exists.
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

console.log("Jadval:");
await run(
  "samples",
  `CREATE TABLE IF NOT EXISTS samples (
     id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id          varchar NOT NULL,
     barcode           text    NOT NULL UNIQUE,
     status            text    NOT NULL DEFAULT 'kutilmoqda',
     collected_at      timestamptz,
     collected_by      varchar,
     collected_by_name text,
     received_at       timestamptz,
     received_by       varchar,
     received_by_name  text,
     rejected_at       timestamptz,
     rejected_by       varchar,
     rejected_by_name  text,
     reject_reason     text,
     reject_note       text,
     created_at        timestamptz NOT NULL DEFAULT now()
   )`,
);
await run(
  "samples.order_id index",
  `CREATE INDEX IF NOT EXISTS "IDX_samples_order" ON samples (order_id)`,
);
await run(
  "samples.barcode index",
  `CREATE INDEX IF NOT EXISTS "IDX_samples_barcode" ON samples (barcode)`,
);

// One tube per pre-existing order. The NOT EXISTS guard is what makes a second
// run harmless; the UNIQUE barcode would reject the duplicate anyway, but this
// keeps the script from failing rather than relying on an error.
console.log("Eski buyurtmalar:");
const { rowCount } = await pool.query(`
  INSERT INTO samples (order_id, barcode, status, received_at, created_at)
  SELECT o.id,
         'LAB-' || o.order_number,
         CASE WHEN o.status = 'completed' THEN 'qabul_qilindi' ELSE 'kutilmoqda' END,
         CASE WHEN o.status = 'completed' THEN o.completed_at END,
         o.created_at
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM samples s WHERE s.order_id = o.id)
`);
console.log(`  ok  ${rowCount} ta buyurtmaga namuna yaratildi`);

await pool.end();
console.log("\nTayyor.");
