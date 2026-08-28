/**
 * Restores a snapshot produced by GET /api/backup.
 *
 *   node scripts/restore-backup.mjs medlab-backup-2026-08-07.json          # dry run
 *   node scripts/restore-backup.mjs medlab-backup-2026-08-07.json --yes    # apply
 *
 * This is a CLI tool and not an endpoint on purpose. "Replace the whole
 * database" reachable from a logged-in browser session is a foot-gun that no
 * confirmation dialog makes safe — one stolen session or one mis-click and the
 * lab's history is gone. Requiring shell access puts a real boundary in front
 * of it.
 *
 * Without --yes nothing is written: it reports what the file holds and what the
 * database holds, so the operator can see what they are about to overwrite.
 *
 * Staff accounts are NOT restored. The backup carries no password hashes, so
 * writing users back would create accounts nobody can sign in to. Recreate them
 * from Sozlamalar after a restore; the seeded admin is always available.
 */
import { readFileSync } from "fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — nothing to load
}

const [, , file, ...flags] = process.argv;
const apply = flags.includes("--yes");

if (!file) {
  console.error("Foydalanish: node scripts/restore-backup.mjs <backup.json> [--yes]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL topilmadi.");
  process.exit(1);
}

let backup;
try {
  backup = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`Faylni o'qib bo'lmadi: ${err.message}`);
  process.exit(1);
}

for (const key of ["patients", "orders", "tests"]) {
  if (!Array.isArray(backup[key])) {
    console.error(`Fayl buzuq yoki noto'g'ri formatda: "${key}" massivi yo'q.`);
    process.exit(1);
  }
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const count = async (t) => (await pool.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;

console.log(`Zaxira:   ${backup.exportedAt ?? "sana yo'q"}  (versiya ${backup.version ?? "?"})`);
console.log("");
console.log("                 faylda    bazada");
for (const [label, key, table] of [
  ["tahlillar", "tests", "tests"],
  ["bemorlar", "patients", "patients"],
  ["buyurtmalar", "orders", "orders"],
  ["xarajatlar", "expenses", "expenses"],
]) {
  const inFile = (backup[key] ?? []).length;
  console.log(`  ${label.padEnd(14)} ${String(inFile).padStart(6)}    ${String(await count(table)).padStart(6)}`);
}

if (!apply) {
  console.log("\nSinov rejimi — hech narsa o'zgartirilmadi.");
  console.log("Haqiqatan tiklash uchun --yes qo'shing. DIQQAT: mavjud ma'lumotlar o'chiriladi.");
  await pool.end();
  process.exit(0);
}

console.log("\nTiklanmoqda...");
const client = await pool.connect();
try {
  // One transaction: a restore that stops halfway would leave the lab with a
  // database that is neither the old one nor the new one.
  await client.query("BEGIN");

  await client.query("DELETE FROM order_tests");
  await client.query("DELETE FROM payments");
  await client.query("DELETE FROM orders");
  await client.query("DELETE FROM patients");
  await client.query("DELETE FROM expenses");
  await client.query("DELETE FROM tests");

  for (const t of backup.tests ?? []) {
    await client.query(
      `INSERT INTO tests (id, name, price, category, unit, reference_range, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [t.id, t.name, t.price, t.category, t.unit, t.referenceRange, t.isActive ?? true],
    );
  }

  for (const p of backup.patients ?? []) {
    await client.query(
      `INSERT INTO patients (id, patient_number, full_name, phone, address, age, gender,
                             created_at, telegram_chat_id, telegram_linked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p.id, p.patientNumber, p.fullName, p.phone, p.address, p.age, p.gender,
       p.createdAt, p.telegramChatId, p.telegramLinkedAt],
    );
  }

  for (const o of backup.orders ?? []) {
    await client.query(
      `INSERT INTO orders (id, order_number, patient_id, total_amount, discount, paid_amount,
                           status, notes, referrer, created_by, created_at, completed_at, telegram_sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [o.id, o.orderNumber, o.patientId, o.totalAmount, o.discount, o.paidAmount,
       o.status, o.notes, o.referrer ?? null, o.createdBy, o.createdAt, o.completedAt, o.telegramSentAt],
    );
    for (const i of o.items ?? []) {
      await client.query(
        `INSERT INTO order_tests (id, order_id, test_id, test_name, price, unit, reference_range,
                                  result, flag, notes, entered_by, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [i.id, o.id, i.testId, i.testName, i.price, i.unit, i.referenceRange,
         i.result, i.flag, i.notes, i.enteredBy ?? null, i.completedAt],
      );
    }
    // The ledger is not in the snapshot, so the historic total becomes one
    // opening entry — same rule the v2 migration uses.
    if (o.paidAmount > 0) {
      await client.query(
        `INSERT INTO payments (order_id, amount, method, note, created_by, created_by_name, created_at)
         VALUES ($1,$2,'naqd','Zaxiradan tiklandi',$3,'—',$4)`,
        [o.id, o.paidAmount, o.createdBy, o.createdAt],
      );
    }
  }

  for (const e of backup.expenses ?? []) {
    await client.query(
      `INSERT INTO expenses (id, category, amount, note, spent_on, created_by, created_by_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.id, e.category, e.amount, e.note, e.spentOn, e.createdBy, e.createdByName, e.createdAt],
    );
  }

  if (backup.settings) {
    const s = backup.settings;
    await client.query(
      `INSERT INTO lab_settings (id, lab_name, tagline, address, phone, director, license_number)
       VALUES ('default',$1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         lab_name = EXCLUDED.lab_name, tagline = EXCLUDED.tagline, address = EXCLUDED.address,
         phone = EXCLUDED.phone, director = EXCLUDED.director, license_number = EXCLUDED.license_number`,
      [s.labName, s.tagline, s.address, s.phone, s.director, s.licenseNumber],
    );
  }

  // Sequences must clear the restored rows or the next insert collides.
  await client.query(`
    SELECT setval(pg_get_serial_sequence('patients', 'patient_number'),
                  greatest((SELECT coalesce(max(patient_number), 0) FROM patients), 1))`);
  await client.query(`
    SELECT setval(pg_get_serial_sequence('orders', 'order_number'),
                  greatest((SELECT coalesce(max(order_number), 1000) FROM orders), 1000))`);

  await client.query("COMMIT");
  console.log("Tiklandi.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Xato — hech narsa o'zgartirilmadi:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
