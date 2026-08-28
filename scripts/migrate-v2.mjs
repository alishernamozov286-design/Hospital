/**
 * Brings a database created before the payments / expenses / audit release up
 * to the current schema.
 *
 *   npm run db:migrate
 *
 * Every statement is guarded (IF NOT EXISTS, or a catalogue lookup), so this is
 * safe to run repeatedly and safe to run against a fresh database.
 *
 * The one thing that is not a plain DDL step is backfilling the payment ledger:
 * orders created before this release carry a paid_amount with no rows behind
 * it. Those are turned into a single opening payment each, so the ledger and
 * the cached total agree from day one — otherwise every historic order would
 * look unpaid in the new payment history.
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

console.log("Ustunlar:");
await run("orders.referrer", `ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer text`);
await run(
  "order_tests.entered_by",
  `ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS entered_by varchar`,
);

console.log("Jadvallar:");
await run(
  "payments",
  `CREATE TABLE IF NOT EXISTS payments (
     id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     order_id        varchar NOT NULL,
     amount          integer NOT NULL,
     method          text    NOT NULL DEFAULT 'naqd',
     note            text,
     created_by      varchar,
     created_by_name text,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
);
await run(
  "payments.order_id index",
  `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id)`,
);

await run(
  "expenses",
  `CREATE TABLE IF NOT EXISTS expenses (
     id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     category        text    NOT NULL,
     amount          integer NOT NULL,
     note            text,
     spent_on        text    NOT NULL,
     created_by      varchar,
     created_by_name text,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
);
await run(
  "expenses.spent_on index",
  `CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses (spent_on)`,
);

await run(
  "audit_log",
  `CREATE TABLE IF NOT EXISTS audit_log (
     id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id    varchar,
     user_name  text    NOT NULL,
     action     text    NOT NULL,
     entity     text    NOT NULL,
     entity_id  varchar,
     summary    text    NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
);
await run(
  "audit_log.created_at index",
  `CREATE INDEX IF NOT EXISTS "IDX_audit_created" ON audit_log (created_at)`,
);

// Backfill: one opening payment per pre-existing paid order. The NOT EXISTS
// guard is what makes re-running this harmless — an order that already has any
// ledger row is left alone rather than credited twice.
console.log("Eski to'lovlar:");
const { rowCount } = await pool.query(`
  INSERT INTO payments (order_id, amount, method, note, created_by, created_by_name, created_at)
  SELECT o.id, o.paid_amount, 'naqd', 'Migratsiya: boshlang''ich to''lov',
         o.created_by,
         coalesce((SELECT u.full_name FROM users u WHERE u.id = o.created_by), '—'),
         o.created_at
  FROM orders o
  WHERE o.paid_amount > 0
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
`);
console.log(`  ok  ${rowCount} ta buyurtmaga boshlang'ich to'lov yozildi`);

// Safety net: after the backfill the cache and the ledger must agree exactly.
const { rows: drift } = await pool.query(`
  SELECT count(*)::int AS n
  FROM orders o
  WHERE o.paid_amount <> (SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.order_id = o.id)
`);
if (drift[0].n > 0) {
  console.warn(`  DIQQAT: ${drift[0].n} ta buyurtmada to'lov yig'indisi mos kelmadi`);
} else {
  console.log("  ok  to'lov yig'indilari buyurtmalarga mos");
}

console.log("\nMigratsiya tugadi.");
await pool.end();
