import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { defaultTests, testReferences } from "@shared/tests-data";
import {
  auditLog,
  expenses,
  labSettings,
  orderTests,
  orders,
  patients,
  payments,
  samples,
  telegramContacts,
  tests,
  users,
  type AuditEntry,
  type CreatePaymentInput,
  type DashboardStatsData,
  type Expense,
  type InsertExpense,
  type Payment,
  type InsertPatient,
  type InsertTest,
  type InsertUser,
  type LabSettings,
  type LabSettingsInput,
  type Order,
  type OrderListResponse,
  type OrderStatus,
  type OrderTest,
  type OrderWithDetails,
  type Patient,
  type PublicUser,
  type RevenueReportData,
  type ResultFlag,
  type Sample,
  type SampleStatus,
  type TelegramContact,
  type Test,
  type UpdateOrderInput,
  type UpdateSampleInput,
  type UpdateUserInput,
  type User,
  nationalPhoneDigits,
} from "@shared/schema";
import { canTransition, parseBarcode, sampleBarcode, transitionError } from "@shared/sample";
import { db } from "./db-pg";
import { hashPassword } from "./password";
import {
  DEFAULT_SETTINGS,
  SEED_USERS,
  todayKey,
  type Actor,
  type AuditInput,
  type AuditQuery,
  type CreateOrderArgs,
  type ExpenseQuery,
  type IStorage,
  type OrderQuery,
  type Paged,
  type PatientQuery,
  type ResultInput,
  resolveFlag,
} from "./storage-types";
import type { LockState } from "@shared/lockout";

/**
 * Postgres returns timestamptz as "2026-08-05 09:02:24.048+00", which Safari's
 * Date parser rejects. Normalise to ISO-8601 so both storage backends hand the
 * client byte-identical strings.
 */
const iso = <T extends string | null>(value: T): T =>
  (value ? (new Date(value).toISOString() as T) : value);

const mapUser = (row: typeof users.$inferSelect): User => ({ ...row, createdAt: iso(row.createdAt) });

const mapPatient = (row: typeof patients.$inferSelect): Patient => ({
  ...row,
  createdAt: iso(row.createdAt),
  telegramLinkedAt: iso(row.telegramLinkedAt),
});

const mapOrder = (row: typeof orders.$inferSelect): Order => ({
  ...row,
  status: row.status as Order["status"],
  createdAt: iso(row.createdAt),
  completedAt: iso(row.completedAt),
  telegramSentAt: iso(row.telegramSentAt),
});

const mapItem = (row: typeof orderTests.$inferSelect): OrderTest => ({
  ...row,
  flag: row.flag as ResultFlag | null,
  completedAt: iso(row.completedAt),
});

const mapSample = (row: typeof samples.$inferSelect): Sample => ({
  ...row,
  status: row.status as SampleStatus,
  createdAt: iso(row.createdAt),
  collectedAt: iso(row.collectedAt),
  receivedAt: iso(row.receivedAt),
  rejectedAt: iso(row.rejectedAt),
});

const strip = (user: typeof users.$inferSelect): PublicUser => {
  const { password: _password, ...pub } = mapUser(user);
  return pub;
};

/**
 * Date filters compare on the lab's local day. Postgres stores timestamptz, so
 * the comparison is done in SQL against the server's own timezone rather than
 * pulling rows into JS first.
 */
const dayExpr = sql`(${orders.createdAt} AT TIME ZONE current_setting('TIMEZONE'))::date`;

export class PgStorage implements IStorage {
  async seed(): Promise<{ createdTests: number; createdUsers: number }> {
    let createdTests = 0;
    const [{ count: testCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tests);

    if (testCount === 0) {
      const rows = defaultTests.map((t) => {
        const ref = testReferences[t.id];
        return {
          id: t.id,
          name: t.name,
          price: t.price,
          category: t.category,
          unit: ref?.unit ?? null,
          referenceRange: ref?.referenceRange ?? null,
          isActive: true,
        };
      });
      await db.insert(tests).values(rows);
      createdTests = rows.length;
    }

    let createdUsers = 0;
    const [{ count: userCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    if (userCount === 0) {
      for (const u of SEED_USERS) {
        await db.insert(users).values({
          username: u.username,
          password: await hashPassword(u.password),
          fullName: u.fullName,
          role: u.role,
          isActive: true,
        });
      }
      createdUsers = SEED_USERS.length;
    }

    // Settings is a singleton row; create it if this is a fresh database.
    const existing = await db.select().from(labSettings).limit(1);
    if (existing.length === 0) {
      await db.insert(labSettings).values(DEFAULT_SETTINGS);
    }

    return { createdTests, createdUsers };
  }

  // ---------------------------------------------------------------- users

  async listUsers(): Promise<PublicUser[]> {
    const rows = await db.select().from(users).orderBy(asc(users.fullName));
    return rows.map(strip);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row && mapUser(row);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .limit(1);
    return row && mapUser(row);
  }

  async createUser(input: InsertUser): Promise<PublicUser> {
    const [row] = await db
      .insert(users)
      .values({
        username: input.username,
        password: await hashPassword(input.password),
        fullName: input.fullName,
        role: input.role,
        isActive: input.isActive ?? true,
      })
      .returning();
    return strip(row);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<PublicUser | undefined> {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.username) patch.username = input.username;
    if (input.fullName) patch.fullName = input.fullName;
    if (input.role) patch.role = input.role;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.password) patch.password = await hashPassword(input.password);
    if (Object.keys(patch).length === 0) {
      const current = await this.getUser(id);
      return current ? strip(current) : undefined;
    }
    const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row ? strip(row) : undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return rows.length > 0;
  }

  async setLockState(userId: string, state: LockState): Promise<void> {
    await db
      .update(users)
      .set({
        failedAttempts: state.failedAttempts,
        lockedUntil: state.lockedUntil,
        lockLevel: state.lockLevel,
        // Stamped on every write so an admin can see when the trouble started.
        lastFailedAt: state.failedAttempts > 0 || state.lockedUntil ? new Date().toISOString() : null,
      })
      .where(eq(users.id, userId));
  }

  // ------------------------------------------------------------- patients

  async listPatients(query: PatientQuery = {}): Promise<Paged<Patient>> {
    const search = query.search?.trim();
    let where;
    if (search) {
      const like = "%" + search + "%";
      const parts = [
        sql`${patients.fullName} ILIKE ${like}`,
        sql`${patients.phone} ILIKE ${like}`,
        sql`coalesce(${patients.address}, '') ILIKE ${like}`,
      ];
      // Formatting-insensitive phone match: "901234567" finds "+998 90 123 45 67".
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 3) {
        parts.push(sql`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}`);
      }
      // A bare number is the patient number itself: "14" or "#14".
      const numberMatch = search.match(/^#?\s*(\d{1,9})$/);
      if (numberMatch) parts.push(eq(patients.patientNumber, Number(numberMatch[1])));
      where = or(...parts);
    }

    let q = db
      .select()
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt), desc(patients.patientNumber))
      .$dynamic();
    if (query.limit !== undefined) q = q.limit(query.limit);
    if (query.offset) q = q.offset(query.offset);

    const [rows, [{ count }]] = await Promise.all([
      q,
      db.select({ count: sql<number>`count(*)::int` }).from(patients).where(where),
    ]);

    return { items: rows.map(mapPatient), total: count };
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    return row && mapPatient(row);
  }

  async getPatientByPhone(phone: string): Promise<Patient | undefined> {
    const digits = nationalPhoneDigits(phone);
    if (digits.length !== 9) return undefined;
    // Suffix match on the digits only: the column keeps "+998 90 123 45 67".
    const [row] = await db
      .select()
      .from(patients)
      .where(sql`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits}`)
      .orderBy(desc(patients.createdAt))
      .limit(1);
    return row && mapPatient(row);
  }

  async getPatientByChatId(chatId: string): Promise<Patient | undefined> {
    const [row] = await db
      .select()
      .from(patients)
      .where(eq(patients.telegramChatId, chatId))
      .limit(1);
    return row && mapPatient(row);
  }

  async createPatient(input: InsertPatient): Promise<Patient> {
    const [row] = await db
      .insert(patients)
      .values({
        fullName: input.fullName,
        phone: input.phone,
        address: input.address ?? null,
        age: input.age ?? null,
        gender: input.gender ?? null,
      })
      .returning();
    return mapPatient(row);
  }

  async updatePatient(id: string, input: Partial<InsertPatient>): Promise<Patient | undefined> {
    const patch: Partial<typeof patients.$inferInsert> = {};
    if (input.fullName !== undefined) patch.fullName = input.fullName;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.address !== undefined) patch.address = input.address ?? null;
    if (input.age !== undefined) patch.age = input.age ?? null;
    if (input.gender !== undefined) patch.gender = input.gender ?? null;
    if (Object.keys(patch).length === 0) return this.getPatient(id);
    const [row] = await db.update(patients).set(patch).where(eq(patients.id, id)).returning();
    return row && mapPatient(row);
  }

  async deletePatient(id: string): Promise<boolean> {
    // Refuse rather than orphan the order history.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.patientId, id));
    if (count > 0) {
      throw new Error("Bu bemorda buyurtmalar mavjud — avval buyurtmalarni o'chiring");
    }
    const rows = await db.delete(patients).where(eq(patients.id, id)).returning({ id: patients.id });
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- tests

  async listTests(opts: { activeOnly?: boolean } = {}): Promise<Test[]> {
    return db
      .select()
      .from(tests)
      .where(opts.activeOnly ? eq(tests.isActive, true) : undefined)
      .orderBy(asc(tests.category), asc(tests.name));
  }

  async getTest(id: string): Promise<Test | undefined> {
    const [row] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
    return row;
  }

  async createTest(input: InsertTest): Promise<Test> {
    const [row] = await db
      .insert(tests)
      .values({
        name: input.name,
        price: input.price,
        category: input.category,
        unit: input.unit ?? null,
        referenceRange: input.referenceRange ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();
    return row;
  }

  async updateTest(id: string, input: Partial<InsertTest>): Promise<Test | undefined> {
    const patch: Partial<typeof tests.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.price !== undefined) patch.price = input.price;
    if (input.category !== undefined) patch.category = input.category;
    if (input.unit !== undefined) patch.unit = input.unit ?? null;
    if (input.referenceRange !== undefined) patch.referenceRange = input.referenceRange ?? null;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length === 0) return this.getTest(id);
    const [row] = await db.update(tests).set(patch).where(eq(tests.id, id)).returning();
    return row;
  }

  async deleteTest(id: string): Promise<boolean> {
    const rows = await db.delete(tests).where(eq(tests.id, id)).returning({ id: tests.id });
    return rows.length > 0;
  }

  // --------------------------------------------------------------- orders

  /** Attaches patient + line items + sample to a set of orders in three extra queries. */
  private async hydrate(rows: (typeof orders.$inferSelect)[]): Promise<OrderWithDetails[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((o) => o.id);
    const patientIds = Array.from(new Set(rows.map((o) => o.patientId)));

    // The sample is fetched for the whole page in one query rather than per
    // row: the results queue renders 24 cards and each needs its tube's status
    // to decide whether to warn, which row-by-row would be 24 round trips.
    const [items, people, tubes] = await Promise.all([
      db.select().from(orderTests).where(inArray(orderTests.orderId, orderIds)),
      db.select().from(patients).where(inArray(patients.id, patientIds)),
      db.select().from(samples).where(inArray(samples.orderId, orderIds)),
    ]);

    const byPatient = new Map(people.map((p) => [p.id, mapPatient(p)]));
    const bySample = new Map(tubes.map((s) => [s.orderId, mapSample(s)]));
    const byOrder = new Map<string, OrderTest[]>();
    for (const item of items) {
      const list = byOrder.get(item.orderId) ?? [];
      list.push(mapItem(item));
      byOrder.set(item.orderId, list);
    }

    return rows.map((row) => ({
      ...mapOrder(row),
      patient: byPatient.get(row.patientId) ?? null,
      items: byOrder.get(row.id) ?? [],
      // Null for orders created before sample tracking existed.
      sample: bySample.get(row.id) ?? null,
    }));
  }

  async listOrders(query: OrderQuery = {}): Promise<OrderListResponse> {
    // "base" holds every filter except status and queue: the summary has to
    // count across all four statuses and both queues, otherwise the tabs would
    // only ever report the tab you are already looking at.
    const base = [];
    if (query.patientId) base.push(eq(orders.patientId, query.patientId));
    if (query.from) base.push(gte(dayExpr, sql`${query.from}::date`));
    if (query.to) base.push(lte(dayExpr, sql`${query.to}::date`));

    const search = query.search?.trim();
    if (search) {
      const like = "%" + search + "%";
      const digits = search.replace(/\D/g, "");
      // Same formatting-insensitive phone rule as listPatients.
      const phoneDigits =
        digits.length >= 3
          ? sql` OR regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}`
          : sql``;
      base.push(sql`(
        EXISTS (SELECT 1 FROM ${patients} p
                WHERE p.id = ${orders.patientId}
                  AND (p.full_name ILIKE ${like} OR p.phone ILIKE ${like}${phoneDigits}))
        OR ${orders.orderNumber}::text ILIKE ${like}
        OR EXISTS (SELECT 1 FROM ${orderTests} ot
                   WHERE ot.order_id = ${orders.id} AND ot.test_name ILIKE ${like})
      )`);
    }
    const baseWhere = base.length ? and(...base) : undefined;

    const notCancelled = sql`${orders.status} <> 'cancelled'`;
    const hasItems = sql`EXISTS (SELECT 1 FROM ${orderTests} ot WHERE ot.order_id = ${orders.id})`;
    const hasBlank = sql`EXISTS (SELECT 1 FROM ${orderTests} ot
                                 WHERE ot.order_id = ${orders.id}
                                   AND (ot.result IS NULL OR ot.result = ''))`;
    const readyExpr = sql`(${hasItems} AND NOT ${hasBlank})`;

    const conditions = [...base];
    if (query.status) conditions.push(eq(orders.status, query.status));
    if (query.queue) {
      conditions.push(notCancelled);
      conditions.push(query.queue === "waiting" ? hasBlank : readyExpr);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    let q = db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).$dynamic();
    if (query.limit !== undefined) q = q.limit(query.limit);
    if (query.offset) q = q.offset(query.offset);

    const liveBase = baseWhere ? and(baseWhere, notCancelled) : notCancelled;
    const billable = where ? and(where, notCancelled) : notCancelled;

    const [rows, statusRows, [queueRow], [totalsRow], [{ count }]] = await Promise.all([
      q,
      db
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .where(baseWhere)
        .groupBy(orders.status),
      db
        .select({
          waiting: sql<number>`count(*) FILTER (WHERE ${hasBlank})::int`,
          ready: sql<number>`count(*) FILTER (WHERE ${readyExpr})::int`,
        })
        .from(orders)
        .where(liveBase),
      db
        .select({
          sum: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::int`,
          paid: sql<number>`coalesce(sum(${orders.paidAmount}), 0)::int`,
        })
        .from(orders)
        .where(billable),
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(where),
    ]);

    const counts = { all: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const row of statusRows) {
      counts.all += row.count;
      if (row.status in counts) counts[row.status as OrderStatus] = row.count;
    }

    const sum = totalsRow?.sum ?? 0;
    const paid = totalsRow?.paid ?? 0;

    return {
      items: await this.hydrate(rows),
      total: count,
      summary: {
        counts,
        results: { waiting: queueRow?.waiting ?? 0, ready: queueRow?.ready ?? 0 },
        totals: { sum, paid, debt: Math.max(0, sum - paid) },
      },
    };
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const [hydrated] = await this.hydrate(rows);
    if (!hydrated) return undefined;
    // Only the single-order view carries the ledger; loading it per row in the
    // list endpoints would be an N+1 for something no list renders.
    hydrated.payments = await this.listPayments(id);
    return hydrated;
  }

  private async listPayments(orderId: string): Promise<Payment[]> {
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt));
    return rows.map((r) => ({
      ...r,
      method: r.method as Payment["method"],
      createdAt: iso(r.createdAt),
    }));
  }

  /**
   * orders.paidAmount is a cache of the ledger. Recomputing it from the rows
   * after every change is what keeps the two from drifting — incrementing it in
   * place silently loses a payment whenever a write fails halfway.
   */
  private async syncPaid(tx: typeof db, orderId: string): Promise<void> {
    await tx
      .update(orders)
      .set({
        paidAmount: sql`greatest(0, (SELECT coalesce(sum(amount), 0)::int FROM ${payments} WHERE order_id = ${orderId}))`,
      })
      .where(eq(orders.id, orderId));
  }

  async createOrder(input: CreateOrderArgs): Promise<OrderWithDetails> {
    const patient = await this.getPatient(input.patientId);
    if (!patient) throw new Error("Bemor topilmadi");

    const selected = await db.select().from(tests).where(inArray(tests.id, input.testIds));
    if (selected.length === 0) throw new Error("Tanlangan tahlillar topilmadi");

    const subtotal = selected.reduce((sum, t) => sum + t.price, 0);
    const discount = Math.min(input.discount, subtotal);
    const total = subtotal - discount;

    const opening = Math.min(input.paidAmount, total);

    // One transaction, so an order never exists without its line items.
    const orderId = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          patientId: input.patientId,
          totalAmount: total,
          discount,
          paidAmount: opening,
          status: "pending",
          notes: input.notes ?? null,
          referrer: input.referrer ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber });

      await tx.insert(orderTests).values(
        selected.map((t) => ({
          orderId: order.id,
          testId: t.id,
          testName: t.name,
          price: t.price,
          unit: t.unit,
          referenceRange: t.referenceRange,
        })),
      );

      // The tube is created with the order, not when someone remembers to.
      // Its barcode is derived from the order number the sequence just handed
      // us inside this same transaction, so it inherits that uniqueness.
      await tx.insert(samples).values({
        orderId: order.id,
        barcode: sampleBarcode(order.orderNumber),
        status: "kutilmoqda",
      });

      // The amount handed over at the counter is the ledger's first entry, not
      // a number written straight onto the order — otherwise the first payment
      // of every order would be missing from the till history.
      if (opening > 0) {
        const [staff] = input.createdBy
          ? await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, input.createdBy)).limit(1)
          : [];
        await tx.insert(payments).values({
          orderId: order.id,
          amount: opening,
          method: "naqd",
          createdBy: input.createdBy ?? null,
          createdByName: staff?.fullName ?? "—",
        });
      }

      return order.id;
    });

    return (await this.getOrder(orderId))!;
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<OrderWithDetails | undefined> {
    const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!current) return undefined;

    if (input.testIds) await this.replaceOrderTests(id, input.testIds);

    const patch: Partial<typeof orders.$inferInsert> = {};

    // Recomputed after any test change, so the discount is always capped
    // against the *new* subtotal rather than a stale one.
    if (input.discount !== undefined || input.testIds) {
      const [{ subtotal }] = await db
        .select({ subtotal: sql<number>`coalesce(sum(${orderTests.price}), 0)::int` })
        .from(orderTests)
        .where(eq(orderTests.orderId, id));
      patch.discount = Math.min(input.discount ?? current.discount, subtotal);
      patch.totalAmount = subtotal - patch.discount;
    }

    if (input.notes !== undefined) patch.notes = input.notes ?? null;
    if (input.referrer !== undefined) patch.referrer = input.referrer ?? null;
    if (input.status) {
      patch.status = input.status;
      patch.completedAt = input.status === "completed" ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(orders).set(patch).where(eq(orders.id, id));
    }
    return this.getOrder(id);
  }

  /**
   * Makes the order's line items match `testIds`.
   *
   * Two rules the caller cannot override. A line that already holds a result is
   * kept even if the caller left it out — an entered value is unrecoverable,
   * and a mis-click on a checkbox must not destroy one. And a test already on
   * the order keeps its original line, so its result, notes and the price
   * snapshot taken at registration all survive the edit.
   */
  private async replaceOrderTests(orderId: string, testIds: string[]): Promise<void> {
    const current = await db.select().from(orderTests).where(eq(orderTests.orderId, orderId));
    const wanted = new Set(testIds);

    const drop = current.filter((i) => !wanted.has(i.testId) && !i.result).map((i) => i.id);
    const present = new Set(current.filter((i) => !drop.includes(i.id)).map((i) => i.testId));
    const addIds = testIds.filter((t) => !present.has(t));

    const toAdd = addIds.length
      ? await db.select().from(tests).where(inArray(tests.id, addIds))
      : [];

    if (drop.length === 0 && toAdd.length === 0) return;

    await db.transaction(async (tx) => {
      if (drop.length) await tx.delete(orderTests).where(inArray(orderTests.id, drop));
      if (toAdd.length) {
        await tx.insert(orderTests).values(
          toAdd.map((t) => ({
            orderId,
            testId: t.id,
            testName: t.name,
            price: t.price,
            unit: t.unit,
            referenceRange: t.referenceRange,
          })),
        );
      }
    });
  }

  async saveResults(
    id: string,
    results: ResultInput[],
    actor?: Actor,
  ): Promise<OrderWithDetails | undefined> {
    const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!current) return undefined;

    const now = new Date().toISOString();

    // Needed to auto-flag: several ranges are sex-split, and the line carries
    // the reference text that was snapshotted at registration.
    const [patient] = await db
      .select({ gender: patients.gender })
      .from(patients)
      .where(eq(patients.id, current.patientId))
      .limit(1);
    const lines = await db
      .select({ id: orderTests.id, referenceRange: orderTests.referenceRange })
      .from(orderTests)
      .where(eq(orderTests.orderId, id));
    const rangeById = new Map(lines.map((l) => [l.id, l.referenceRange]));

    await db.transaction(async (tx) => {
      for (const incoming of results) {
        const value = incoming.result?.trim() || null;
        const flag = resolveFlag(
          incoming,
          { referenceRange: rangeById.get(incoming.id) ?? null },
          patient?.gender,
        );
        await tx
          .update(orderTests)
          .set({
            result: value,
            flag,
            notes: incoming.notes?.trim() || null,
            completedAt: value ? now : null,
            ...(value && actor ? { enteredBy: actor.name } : {}),
          })
          .where(and(eq(orderTests.id, incoming.id), eq(orderTests.orderId, id)));
      }

      // Status follows the line items: all filled -> completed, some -> in_progress.
      if (current.status !== "cancelled") {
        const [{ total, filled }] = await tx
          .select({
            total: sql<number>`count(*)::int`,
            filled: sql<number>`count(${orderTests.result})::int`,
          })
          .from(orderTests)
          .where(eq(orderTests.orderId, id));

        const status = total > 0 && filled === total ? "completed" : filled > 0 ? "in_progress" : "pending";
        await tx
          .update(orders)
          .set({ status, completedAt: status === "completed" ? now : null })
          .where(eq(orders.id, id));
      }
    });

    return this.getOrder(id);
  }

  async deleteOrder(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      await tx.delete(orderTests).where(eq(orderTests.orderId, id));
      await tx.delete(payments).where(eq(payments.orderId, id));
      // Must go with the order: the barcode is unique, so an orphan row would
      // block the number from ever being used again.
      await tx.delete(samples).where(eq(samples.orderId, id));
      const rows = await tx.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
      return rows.length > 0;
    });
  }

  // -------------------------------------------------------------- samples

  async getOrderByBarcode(barcode: string): Promise<OrderWithDetails | undefined> {
    const orderNumber = parseBarcode(barcode);
    if (orderNumber === null) return undefined;

    // Resolved through the order number rather than the barcode string, so a
    // scan still finds orders created before sample tracking — they have no
    // samples row to match against.
    const [row] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return row ? this.getOrder(row.id) : undefined;
  }

  async updateSampleStatus(
    orderId: string,
    input: UpdateSampleInput,
    actor: Actor,
  ): Promise<{ sample: Sample; order: OrderWithDetails } | { error: string } | undefined> {
    const [current] = await db.select().from(samples).where(eq(samples.orderId, orderId)).limit(1);
    if (!current) return undefined;

    const from = current.status as SampleStatus;
    if (!canTransition(from, input.status)) return { error: transitionError(from, input.status) };

    const now = new Date().toISOString();
    const patch: Partial<typeof samples.$inferInsert> = { status: input.status };

    // Each hand-off stamps its own three columns, so the tube keeps the full
    // history rather than only its latest actor. A step back clears the stamp
    // it is undoing — otherwise a corrected mis-click would leave a collection
    // time for a tube that, as far as the lab is concerned, was never drawn.
    switch (input.status) {
      case "olindi":
        patch.collectedAt = now;
        patch.collectedBy = actor.id;
        patch.collectedByName = actor.name;
        patch.receivedAt = null;
        patch.receivedBy = null;
        patch.receivedByName = null;
        break;
      case "qabul_qilindi":
        patch.receivedAt = now;
        patch.receivedBy = actor.id;
        patch.receivedByName = actor.name;
        break;
      case "kutilmoqda":
        patch.collectedAt = null;
        patch.collectedBy = null;
        patch.collectedByName = null;
        patch.receivedAt = null;
        patch.receivedBy = null;
        patch.receivedByName = null;
        break;
      case "rad_etildi":
        patch.rejectedAt = now;
        patch.rejectedBy = actor.id;
        patch.rejectedByName = actor.name;
        // Validated upstream: rejectReason is required for this status.
        patch.rejectReason = input.rejectReason ?? null;
        patch.rejectNote = input.rejectNote ?? null;
        break;
    }

    const [updated] = await db.update(samples).set(patch).where(eq(samples.id, current.id)).returning();
    const order = await this.getOrder(orderId);
    if (!order) return undefined;

    return { sample: mapSample(updated), order };
  }

  // ------------------------------------------------------------- payments

  async addPayment(
    orderId: string,
    input: CreatePaymentInput,
    actor: Actor,
  ): Promise<OrderWithDetails | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return undefined;

    const [{ paid }] = await db
      .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(eq(payments.orderId, orderId));

    // Neither direction may take the ledger somewhere impossible: no paying
    // past the bill, no refunding money that was never taken.
    const room = order.totalAmount - paid;
    const amount = input.amount > 0 ? Math.min(input.amount, room) : Math.max(input.amount, -paid);
    if (amount === 0) {
      throw new Error(
        input.amount > 0 ? "Buyurtma allaqachon to'liq to'langan" : "Qaytariladigan to'lov yo'q",
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        orderId,
        amount,
        method: input.method,
        note: input.note?.trim() || null,
        createdBy: actor.id,
        createdByName: actor.name,
      });
      await this.syncPaid(tx as unknown as typeof db, orderId);
    });

    return this.getOrder(orderId);
  }

  async deletePayment(paymentId: string): Promise<boolean> {
    const [row] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!row) return false;
    await db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.id, paymentId));
      await this.syncPaid(tx as unknown as typeof db, row.orderId);
    });
    return true;
  }

  // ------------------------------------------------------------- expenses

  async listExpenses(query: ExpenseQuery = {}): Promise<Paged<Expense> & { total_amount: number }> {
    const parts = [];
    if (query.from) parts.push(gte(expenses.spentOn, query.from));
    if (query.to) parts.push(lte(expenses.spentOn, query.to));
    const where = parts.length ? and(...parts) : undefined;

    let q = db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
      .$dynamic();
    if (query.limit !== undefined) q = q.limit(query.limit);
    if (query.offset) q = q.offset(query.offset);

    const [rows, [agg]] = await Promise.all([
      q,
      db
        .select({
          count: sql<number>`count(*)::int`,
          sum: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        })
        .from(expenses)
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
      total: agg?.count ?? 0,
      total_amount: agg?.sum ?? 0,
    };
  }

  async createExpense(input: InsertExpense, actor: Actor): Promise<Expense> {
    const [row] = await db
      .insert(expenses)
      .values({
        category: input.category,
        amount: input.amount,
        note: input.note?.trim() || null,
        spentOn: input.spentOn,
        createdBy: actor.id,
        createdByName: actor.name,
      })
      .returning();
    return { ...row, createdAt: iso(row.createdAt) };
  }

  async deleteExpense(id: string): Promise<boolean> {
    const rows = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- audit

  async writeAudit(input: AuditInput): Promise<void> {
    await db.insert(auditLog).values({
      userId: input.actor.id,
      userName: input.actor.name,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
    });
  }

  async listAudit(query: AuditQuery = {}): Promise<Paged<AuditEntry>> {
    const where = query.entity ? eq(auditLog.entity, query.entity) : undefined;

    let q = db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).$dynamic();
    if (query.limit !== undefined) q = q.limit(query.limit);
    if (query.offset) q = q.offset(query.offset);

    const [rows, [{ count }]] = await Promise.all([
      q,
      db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(where),
    ]);

    return { items: rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })), total: count };
  }

  // ------------------------------------------------------------- telegram

  async linkTelegram(patientId: string, chatId: string): Promise<Patient | undefined> {
    // One chat belongs to one patient: release it from whoever held it before,
    // otherwise a shared phone would quietly send two people the same results.
    await db
      .update(patients)
      .set({ telegramChatId: null, telegramLinkedAt: null })
      .where(and(eq(patients.telegramChatId, chatId), sql`${patients.id} <> ${patientId}`));

    const [row] = await db
      .update(patients)
      .set({ telegramChatId: chatId, telegramLinkedAt: new Date().toISOString() })
      .where(eq(patients.id, patientId))
      .returning();
    return row && mapPatient(row);
  }

  async savePendingContact(input: {
    chatId: string;
    phone: string;
    fullName?: string | null;
    username?: string | null;
  }): Promise<void> {
    const values = {
      chatId: input.chatId,
      phone: input.phone,
      fullName: input.fullName ?? null,
      username: input.username ?? null,
    };
    await db
      .insert(telegramContacts)
      .values(values)
      .onConflictDoUpdate({ target: telegramContacts.chatId, set: values });
  }

  /** Digits-only suffix match, same rule as getPatientByPhone. */
  private pendingByPhone(phone: string) {
    const digits = nationalPhoneDigits(phone);
    if (digits.length !== 9) return undefined;
    return sql`regexp_replace(${telegramContacts.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits}`;
  }

  async findPendingContact(phone: string): Promise<TelegramContact | undefined> {
    const where = this.pendingByPhone(phone);
    if (!where) return undefined;
    const [row] = await db
      .select()
      .from(telegramContacts)
      .where(where)
      .orderBy(desc(telegramContacts.createdAt))
      .limit(1);
    return row && { ...row, createdAt: iso(row.createdAt) };
  }

  async deletePendingContact(chatId: string): Promise<void> {
    await db.delete(telegramContacts).where(eq(telegramContacts.chatId, chatId));
  }

  async unlinkTelegram(chatId: string): Promise<number> {
    const rows = await db
      .update(patients)
      .set({ telegramChatId: null, telegramLinkedAt: null })
      .where(eq(patients.telegramChatId, chatId))
      .returning({ id: patients.id });
    return rows.length;
  }

  async listUndeliveredOrders(patientId: string, limit = 5): Promise<OrderWithDetails[]> {
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.patientId, patientId),
          eq(orders.status, "completed"),
          sql`${orders.telegramSentAt} IS NULL`,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return this.hydrate(rows);
  }

  async markTelegramSent(orderId: string): Promise<void> {
    await db
      .update(orders)
      .set({ telegramSentAt: new Date().toISOString() })
      .where(eq(orders.id, orderId));
  }

  // ------------------------------------------------------------ reporting

  async getDashboardStats(): Promise<DashboardStatsData> {
    const today = todayKey();

    // Deliberately one statement with scalar subqueries rather than several
    // queries: the Neon driver opens a fresh WebSocket per pooled connection,
    // so each extra query costs a full handshake to another continent.
    const { rows } = await db.execute<{
      today_patients: number;
      today_revenue: number;
      pending: number;
      ready: number;
      total_patients: number;
      unpaid: number;
    }>(sql`
      WITH active AS (
        SELECT * FROM ${orders} WHERE status <> 'cancelled'
      ), today AS (
        SELECT * FROM active
        WHERE (created_at AT TIME ZONE current_setting('TIMEZONE'))::date = ${today}::date
      )
      SELECT
        (SELECT count(DISTINCT patient_id) FROM today)::int                                   AS today_patients,
        (SELECT coalesce(sum(paid_amount), 0) FROM today)::int                                AS today_revenue,
        (SELECT count(*) FROM ${orderTests} ot JOIN active a ON a.id = ot.order_id
          WHERE ot.result IS NULL)::int                                                       AS pending,
        (SELECT count(*) FROM ${orderTests} ot JOIN active a ON a.id = ot.order_id
          WHERE ot.result IS NOT NULL)::int                                                   AS ready,
        (SELECT count(*) FROM ${patients})::int                                               AS total_patients,
        (SELECT coalesce(sum(greatest(total_amount - paid_amount, 0)), 0) FROM active)::int    AS unpaid
    `);

    const r = rows[0];
    return {
      todayPatients: r?.today_patients ?? 0,
      pendingTests: r?.pending ?? 0,
      readyTests: r?.ready ?? 0,
      todayRevenue: r?.today_revenue ?? 0,
      totalPatients: r?.total_patients ?? 0,
      unpaidAmount: r?.unpaid ?? 0,
    };
  }

  async getRevenueReport(from: string, to: string): Promise<RevenueReportData> {
    const inRange = and(
      sql`${orders.status} <> 'cancelled'`,
      gte(dayExpr, sql`${from}::date`),
      lte(dayExpr, sql`${to}::date`),
    );

    // Two straightforward groupings merged in JS: counting tests in the same
    // query as orders would multiply the order rows by their line items.
    const [orderDays, testDays] = await Promise.all([
      db
        .select({
          date: sql<string>`to_char(${dayExpr}, 'YYYY-MM-DD')`,
          patients: sql<number>`count(distinct ${orders.patientId})::int`,
          revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::int`,
        })
        .from(orders)
        .where(inRange)
        .groupBy(dayExpr)
        .orderBy(asc(dayExpr)),
      db
        .select({
          date: sql<string>`to_char(${dayExpr}, 'YYYY-MM-DD')`,
          tests: sql<number>`count(*)::int`,
        })
        .from(orderTests)
        .innerJoin(orders, eq(orders.id, orderTests.orderId))
        .where(inRange)
        .groupBy(dayExpr),
    ]);

    const testsByDay = new Map(testDays.map((r) => [r.date, r.tests]));
    const points = orderDays.map((d) => ({ ...d, tests: testsByDay.get(d.date) ?? 0 }));

    const [[totals], topTests, byCategory] = await Promise.all([
      db
        .select({
          totalRevenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::int`,
          totalPaid: sql<number>`coalesce(sum(${orders.paidAmount}), 0)::int`,
          totalPatients: sql<number>`count(distinct ${orders.patientId})::int`,
        })
        .from(orders)
        .where(inRange),
      db
        .select({
          name: orderTests.testName,
          count: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(${orderTests.price}), 0)::int`,
        })
        .from(orderTests)
        .innerJoin(orders, eq(orders.id, orderTests.orderId))
        .where(inRange)
        .groupBy(orderTests.testName)
        .orderBy(desc(sql`sum(${orderTests.price})`))
        .limit(8),
      db
        .select({
          category: sql<string>`coalesce(${tests.category}, 'Boshqa')`,
          count: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(${orderTests.price}), 0)::int`,
        })
        .from(orderTests)
        .innerJoin(orders, eq(orders.id, orderTests.orderId))
        .leftJoin(tests, eq(tests.id, orderTests.testId))
        .where(inRange)
        .groupBy(sql`coalesce(${tests.category}, 'Boshqa')`)
        .orderBy(desc(sql`sum(${orderTests.price})`)),
    ]);

    const spentInRange = and(gte(expenses.spentOn, from), lte(expenses.spentOn, to));
    const [expensesByCategory, byReferrer] = await Promise.all([
      db
        .select({
          category: expenses.category,
          amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        })
        .from(expenses)
        .where(spentInRange)
        .groupBy(expenses.category)
        .orderBy(desc(sql`sum(${expenses.amount})`)),
      db
        .select({
          referrer: sql<string>`coalesce(nullif(btrim(${orders.referrer}), ''), '—')`,
          patients: sql<number>`count(distinct ${orders.patientId})::int`,
          revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::int`,
        })
        .from(orders)
        .where(inRange)
        .groupBy(sql`coalesce(nullif(btrim(${orders.referrer}), ''), '—')`)
        .orderBy(desc(sql`sum(${orders.totalAmount})`))
        .limit(10),
    ]);

    const totalTests = byCategory.reduce((sum, c) => sum + c.count, 0);
    const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.amount, 0);
    const totalPaid = totals?.totalPaid ?? 0;

    return {
      range: { from, to },
      points,
      totalRevenue: totals?.totalRevenue ?? 0,
      totalPaid,
      totalPatients: totals?.totalPatients ?? 0,
      totalTests,
      topTests,
      byCategory,
      totalExpenses,
      // Against money actually collected, not invoiced: an unpaid bill is not
      // cash the lab can spend.
      netProfit: totalPaid - totalExpenses,
      expensesByCategory,
      byReferrer,
    };
  }

  // ------------------------------------------------------------- settings

  async getSettings(): Promise<LabSettings> {
    const [row] = await db.select().from(labSettings).limit(1);
    return row ?? DEFAULT_SETTINGS;
  }

  async updateSettings(input: LabSettingsInput): Promise<LabSettings> {
    const values = {
      id: "default",
      labName: input.labName,
      tagline: input.tagline,
      address: input.address ?? null,
      phone: input.phone ?? null,
      director: input.director ?? null,
      licenseNumber: input.licenseNumber ?? null,
    };
    const [row] = await db
      .insert(labSettings)
      .values(values)
      .onConflictDoUpdate({ target: labSettings.id, set: values })
      .returning();
    return row;
  }
}
