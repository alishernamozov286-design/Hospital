import { randomUUID } from "crypto";
import { defaultTests, testReferences } from "@shared/tests-data";
import { computeFlag } from "@shared/reference-range";
import type {
  AuditEntry,
  CreatePaymentInput,
  DashboardStatsData,
  Expense,
  InsertExpense,
  Payment,
  InsertPatient,
  InsertTest,
  InsertUser,
  LabSettings,
  LabSettingsInput,
  Order,
  OrderListResponse,
  OrderTest,
  OrderWithDetails,
  Patient,
  PublicUser,
  RevenueReportData,
  Sample,
  TelegramContact,
  Test,
  UpdateOrderInput,
  UpdateSampleInput,
  UpdateUserInput,
  User,
} from "@shared/schema";
import { nationalPhoneDigits } from "@shared/schema";
import { canTransition, parseBarcode, sampleBarcode, transitionError } from "@shared/sample";
import { type DbShape, readDbSync, writeDb } from "./db";
import { hashPassword } from "./password";
import {
  SEED_USERS,
  localDay,
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

function contains(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle);
}

const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/**
 * Phone match that ignores formatting: "901234567" has to find the stored
 * "+998 90 123 45 67". Below three digits the query is too loose to be useful.
 */
function phoneContains(phone: string | null | undefined, search: string): boolean {
  const needle = digitsOf(search);
  return needle.length >= 3 && digitsOf(phone).includes(needle);
}

/**
 * A search that is nothing but a number is a lookup by patient/order number:
 * "14", "#14" and " 14 " all mean the same ticket.
 */
function asNumberSearch(search: string): number | null {
  const match = search.trim().match(/^#?\s*(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

/** Still has at least one line item without a result. */
function isWaiting(order: OrderWithDetails): boolean {
  return order.items.some((i) => !i.result);
}

/** Every line item is filled in — the blank can be printed. */
function isReady(order: OrderWithDetails): boolean {
  return order.items.length > 0 && order.items.every((i) => i.result);
}

/** Zero-setup fallback used when DATABASE_URL is not configured. */
export class FileStorage implements IStorage {
  private db: DbShape;

  constructor() {
    this.db = readDbSync();
  }

  private persist(): Promise<void> {
    return writeDb(this.db);
  }

  async seed(): Promise<{ createdTests: number; createdUsers: number }> {
    let createdTests = 0;
    if (this.db.tests.length === 0) {
      this.db.tests = defaultTests.map((t) => {
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
      createdTests = this.db.tests.length;
    }

    let createdUsers = 0;
    if (this.db.users.length === 0) {
      for (const u of SEED_USERS) {
        this.db.users.push({
          id: randomUUID(),
          username: u.username,
          password: await hashPassword(u.password),
          fullName: u.fullName,
          role: u.role,
          isActive: true,
          createdAt: new Date().toISOString(),
          failedAttempts: 0,
          lockedUntil: null,
          lockLevel: 0,
          lastFailedAt: null,
        });
      }
      createdUsers = SEED_USERS.length;
    }

    const numbered = this.backfillPatientNumbers();

    if (createdTests || createdUsers || numbered) await this.persist();
    return { createdTests, createdUsers };
  }

  /**
   * Gives a number to every patient saved before patientNumber existed, oldest
   * first, so the sequence still reads as the order people walked in. Returns
   * how many were touched; zero on every boot after the first.
   */
  private backfillPatientNumbers(): number {
    const missing = this.db.patients
      .filter((p) => typeof p.patientNumber !== "number")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Anything already numbered keeps its number, so the counter has to clear
    // the highest of them before handing out the next one.
    let next = Math.max(
      this.db.counters.patientNumber,
      ...this.db.patients.map((p) => p.patientNumber ?? 0),
      0,
    );
    for (const patient of missing) patient.patientNumber = ++next;
    this.db.counters.patientNumber = next;

    return missing.length;
  }

  // ---------------------------------------------------------------- users

  async listUsers(): Promise<PublicUser[]> {
    return this.db.users
      .map(({ password: _password, ...rest }) => rest)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.db.users.find((u) => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  async createUser(input: InsertUser): Promise<PublicUser> {
    const user: User = {
      id: randomUUID(),
      username: input.username,
      password: await hashPassword(input.password),
      fullName: input.fullName,
      role: input.role,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
      lockLevel: 0,
      lastFailedAt: null,
    };
    this.db.users.push(user);
    await this.persist();
    const { password: _password, ...pub } = user;
    return pub;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<PublicUser | undefined> {
    const user = this.db.users.find((u) => u.id === id);
    if (!user) return undefined;
    if (input.username) user.username = input.username;
    if (input.fullName) user.fullName = input.fullName;
    if (input.role) user.role = input.role;
    if (input.isActive !== undefined) user.isActive = input.isActive;
    if (input.password) user.password = await hashPassword(input.password);
    await this.persist();
    const { password: _password, ...pub } = user;
    return pub;
  }

  async deleteUser(id: string): Promise<boolean> {
    const before = this.db.users.length;
    this.db.users = this.db.users.filter((u) => u.id !== id);
    if (this.db.users.length === before) return false;
    await this.persist();
    return true;
  }

  async setLockState(userId: string, state: LockState): Promise<void> {
    const user = this.db.users.find((u) => u.id === userId);
    if (!user) return;
    user.failedAttempts = state.failedAttempts;
    user.lockedUntil = state.lockedUntil;
    user.lockLevel = state.lockLevel;
    // Stamped on every write so an admin can see when the trouble started.
    user.lastFailedAt =
      state.failedAttempts > 0 || state.lockedUntil ? new Date().toISOString() : null;
    await this.persist();
  }

  // ------------------------------------------------------------- patients

  async listPatients(query: PatientQuery = {}): Promise<Paged<Patient>> {
    const search = query.search?.trim().toLowerCase();
    let rows = [...this.db.patients];
    if (search) {
      const wantedNumber = asNumberSearch(search);
      rows = rows.filter(
        (p) =>
          p.patientNumber === wantedNumber ||
          contains(p.fullName, search) ||
          contains(p.phone, search) ||
          phoneContains(p.phone, search) ||
          contains(p.address, search),
      );
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.patientNumber - a.patientNumber);
    const total = rows.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? total;
    return { items: rows.slice(offset, offset + limit), total };
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    return this.db.patients.find((p) => p.id === id);
  }

  async getPatientByPhone(phone: string): Promise<Patient | undefined> {
    const digits = nationalPhoneDigits(phone);
    if (digits.length !== 9) return undefined;
    return [...this.db.patients]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((p) => nationalPhoneDigits(p.phone) === digits);
  }

  async getPatientByChatId(chatId: string): Promise<Patient | undefined> {
    return this.db.patients.find((p) => p.telegramChatId === chatId);
  }

  async createPatient(input: InsertPatient): Promise<Patient> {
    this.db.counters.patientNumber += 1;
    const patient: Patient = {
      id: randomUUID(),
      patientNumber: this.db.counters.patientNumber,
      fullName: input.fullName,
      phone: input.phone,
      address: input.address ?? null,
      age: input.age ?? null,
      gender: input.gender ?? null,
      createdAt: new Date().toISOString(),
      telegramChatId: null,
      telegramLinkedAt: null,
    };
    this.db.patients.push(patient);
    await this.persist();
    return patient;
  }

  async updatePatient(id: string, input: Partial<InsertPatient>): Promise<Patient | undefined> {
    const patient = this.db.patients.find((p) => p.id === id);
    if (!patient) return undefined;
    if (input.fullName !== undefined) patient.fullName = input.fullName;
    if (input.phone !== undefined) patient.phone = input.phone;
    if (input.address !== undefined) patient.address = input.address ?? null;
    if (input.age !== undefined) patient.age = input.age ?? null;
    if (input.gender !== undefined) patient.gender = input.gender ?? null;
    await this.persist();
    return patient;
  }

  async deletePatient(id: string): Promise<boolean> {
    if (this.db.orders.some((o) => o.patientId === id)) {
      throw new Error("Bu bemorda buyurtmalar mavjud — avval buyurtmalarni o'chiring");
    }
    const before = this.db.patients.length;
    this.db.patients = this.db.patients.filter((p) => p.id !== id);
    if (this.db.patients.length === before) return false;
    await this.persist();
    return true;
  }

  // ---------------------------------------------------------------- tests

  async listTests(opts: { activeOnly?: boolean } = {}): Promise<Test[]> {
    const rows = opts.activeOnly ? this.db.tests.filter((t) => t.isActive) : [...this.db.tests];
    return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  async getTest(id: string): Promise<Test | undefined> {
    return this.db.tests.find((t) => t.id === id);
  }

  async createTest(input: InsertTest): Promise<Test> {
    const test: Test = {
      id: randomUUID(),
      name: input.name,
      price: input.price,
      category: input.category,
      unit: input.unit ?? null,
      referenceRange: input.referenceRange ?? null,
      isActive: input.isActive ?? true,
    };
    this.db.tests.push(test);
    await this.persist();
    return test;
  }

  async updateTest(id: string, input: Partial<InsertTest>): Promise<Test | undefined> {
    const test = this.db.tests.find((t) => t.id === id);
    if (!test) return undefined;
    if (input.name !== undefined) test.name = input.name;
    if (input.price !== undefined) test.price = input.price;
    if (input.category !== undefined) test.category = input.category;
    if (input.unit !== undefined) test.unit = input.unit ?? null;
    if (input.referenceRange !== undefined) test.referenceRange = input.referenceRange ?? null;
    if (input.isActive !== undefined) test.isActive = input.isActive;
    await this.persist();
    return test;
  }

  async deleteTest(id: string): Promise<boolean> {
    const before = this.db.tests.length;
    this.db.tests = this.db.tests.filter((t) => t.id !== id);
    if (this.db.tests.length === before) return false;
    await this.persist();
    return true;
  }

  // --------------------------------------------------------------- orders

  /** `withPayments` is opt-in: the list screens never render the ledger. */
  private hydrate(order: Order, withPayments = false): OrderWithDetails {
    const full: OrderWithDetails = {
      ...order,
      patient: this.db.patients.find((p) => p.id === order.patientId) ?? null,
      items: this.db.orderTests.filter((ot) => ot.orderId === order.id),
      // Null for orders created before sample tracking existed.
      sample: this.db.samples.find((s) => s.orderId === order.id) ?? null,
    };
    if (withPayments) {
      full.payments = this.db.payments
        .filter((p) => p.orderId === order.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return full;
  }

  /**
   * orders.paidAmount is a cache of the ledger. Recomputing it from the rows
   * after every change is what keeps the two from drifting — the alternative,
   * incrementing it in place, silently loses a payment whenever a write fails
   * halfway.
   */
  private syncPaid(orderId: string): void {
    const order = this.db.orders.find((o) => o.id === orderId);
    if (!order) return;
    const sum = this.db.payments
      .filter((p) => p.orderId === orderId)
      .reduce((acc, p) => acc + p.amount, 0);
    order.paidAmount = Math.max(0, sum);
  }

  async listOrders(query: OrderQuery = {}): Promise<OrderListResponse> {
    const search = query.search?.trim().toLowerCase();

    // "base" carries every filter except the two the summary has to look past:
    // status (the tabs need all four counts) and queue.
    let base = this.db.orders.map((o) => this.hydrate(o));
    if (query.patientId) base = base.filter((o) => o.patientId === query.patientId);
    if (query.from) base = base.filter((o) => localDay(o.createdAt) >= query.from!);
    if (query.to) base = base.filter((o) => localDay(o.createdAt) <= query.to!);
    if (search) {
      base = base.filter(
        (o) =>
          contains(o.patient?.fullName, search) ||
          contains(o.patient?.phone, search) ||
          phoneContains(o.patient?.phone, search) ||
          String(o.orderNumber).includes(search) ||
          o.items.some((i) => contains(i.testName, search)),
      );
    }

    const counts = { all: base.length, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const o of base) counts[o.status] += 1;

    const live = base.filter((o) => o.status !== "cancelled");
    const results = {
      waiting: live.filter(isWaiting).length,
      ready: live.filter(isReady).length,
    };

    let rows = base;
    if (query.status) rows = rows.filter((o) => o.status === query.status);
    if (query.queue) {
      const match = query.queue === "waiting" ? isWaiting : isReady;
      rows = rows.filter((o) => o.status !== "cancelled" && match(o));
    }

    const billable = rows.filter((o) => o.status !== "cancelled");
    const sum = billable.reduce((acc, o) => acc + o.totalAmount, 0);
    const paid = billable.reduce((acc, o) => acc + o.paidAmount, 0);

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = rows.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? total;

    return {
      items: rows.slice(offset, offset + limit),
      total,
      summary: { counts, results, totals: { sum, paid, debt: Math.max(0, sum - paid) } },
    };
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const order = this.db.orders.find((o) => o.id === id);
    return order ? this.hydrate(order, true) : undefined;
  }

  async createOrder(input: CreateOrderArgs): Promise<OrderWithDetails> {
    if (!this.db.patients.some((p) => p.id === input.patientId)) {
      throw new Error("Bemor topilmadi");
    }

    const selected = input.testIds
      .map((id) => this.db.tests.find((t) => t.id === id))
      .filter((t): t is Test => Boolean(t));
    if (selected.length === 0) throw new Error("Tanlangan tahlillar topilmadi");

    const subtotal = selected.reduce((sum, t) => sum + t.price, 0);
    const discount = Math.min(input.discount, subtotal);
    const total = subtotal - discount;

    this.db.counters.orderNumber += 1;
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      orderNumber: this.db.counters.orderNumber,
      patientId: input.patientId,
      totalAmount: total,
      discount,
      paidAmount: 0, // set by syncPaid below, from the opening payment
      status: "pending",
      notes: input.notes ?? null,
      referrer: input.referrer ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      completedAt: null,
      telegramSentAt: null,
    };
    this.db.orders.push(order);

    // The tube is created with the order, not when someone remembers to. The
    // barcode is derived from the order number allocated just above, so it is
    // unique for the same reason that number is.
    this.db.samples.push({
      id: randomUUID(),
      orderId: order.id,
      barcode: sampleBarcode(order.orderNumber),
      status: "kutilmoqda",
      collectedAt: null,
      collectedBy: null,
      collectedByName: null,
      receivedAt: null,
      receivedBy: null,
      receivedByName: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectedByName: null,
      rejectReason: null,
      rejectNote: null,
      createdAt: now,
    });

    // The amount handed over at the counter is the ledger's first entry, not a
    // number written straight onto the order — otherwise the very first payment
    // of every order would be missing from the till history.
    const opening = Math.min(input.paidAmount, total);
    if (opening > 0) {
      this.db.payments.push({
        id: randomUUID(),
        orderId: order.id,
        amount: opening,
        method: "naqd",
        note: null,
        createdBy: input.createdBy ?? null,
        createdByName: this.db.users.find((u) => u.id === input.createdBy)?.fullName ?? "—",
        createdAt: now,
      });
    }
    this.syncPaid(order.id);

    for (const t of selected) {
      const item: OrderTest = {
        id: randomUUID(),
        orderId: order.id,
        testId: t.id,
        testName: t.name,
        price: t.price,
        unit: t.unit,
        referenceRange: t.referenceRange,
        result: null,
        flag: null,
        notes: null,
        enteredBy: null,
        completedAt: null,
      };
      this.db.orderTests.push(item);
    }

    await this.persist();
    // With payments, matching what the Postgres backend returns here — the two
    // must be interchangeable or the UI behaves differently per deployment.
    return this.hydrate(order, true);
  }

  async updateOrder(id: string, input: UpdateOrderInput): Promise<OrderWithDetails | undefined> {
    const order = this.db.orders.find((o) => o.id === id);
    if (!order) return undefined;

    if (input.testIds) this.replaceOrderTests(id, input.testIds);

    // Recomputed after any test change, so the discount is always capped
    // against the *new* subtotal rather than a stale one.
    if (input.discount !== undefined || input.testIds) {
      const subtotal = this.db.orderTests
        .filter((i) => i.orderId === id)
        .reduce((s, i) => s + i.price, 0);
      const discount = input.discount ?? order.discount;
      order.discount = Math.min(discount, subtotal);
      order.totalAmount = subtotal - order.discount;
    }
    if (input.notes !== undefined) order.notes = input.notes ?? null;
    if (input.referrer !== undefined) order.referrer = input.referrer ?? null;
    if (input.status) {
      order.status = input.status;
      order.completedAt = input.status === "completed" ? new Date().toISOString() : null;
    }

    await this.persist();
    return this.hydrate(order, true);
  }

  /**
   * Makes the order's line items match `testIds`.
   *
   * Two rules the caller cannot override. A line that already holds a result is
   * kept even if the caller left it out — an entered value is unrecoverable,
   * and a mis-click on a checkbox must not destroy one. And a test that is
   * already on the order keeps its original line, so its result, notes and the
   * price snapshot taken at registration all survive the edit.
   */
  private replaceOrderTests(orderId: string, testIds: string[]): void {
    const current = this.db.orderTests.filter((i) => i.orderId === orderId);
    const wanted = new Set(testIds);

    const keep = new Set(
      current.filter((i) => wanted.has(i.testId) || i.result).map((i) => i.id),
    );
    this.db.orderTests = this.db.orderTests.filter(
      (i) => i.orderId !== orderId || keep.has(i.id),
    );

    const present = new Set(
      this.db.orderTests.filter((i) => i.orderId === orderId).map((i) => i.testId),
    );
    for (const testId of testIds) {
      if (present.has(testId)) continue;
      const t = this.db.tests.find((x) => x.id === testId);
      if (!t) continue;
      this.db.orderTests.push({
        id: randomUUID(),
        orderId,
        testId: t.id,
        testName: t.name,
        price: t.price,
        unit: t.unit,
        referenceRange: t.referenceRange,
        result: null,
        flag: null,
        notes: null,
        enteredBy: null,
        completedAt: null,
      });
      present.add(testId);
    }
  }

  async saveResults(
    id: string,
    results: ResultInput[],
    actor?: Actor,
  ): Promise<OrderWithDetails | undefined> {
    const order = this.db.orders.find((o) => o.id === id);
    if (!order) return undefined;

    const patient = this.db.patients.find((p) => p.id === order.patientId);
    const now = new Date().toISOString();
    for (const incoming of results) {
      const item = this.db.orderTests.find((i) => i.id === incoming.id && i.orderId === id);
      if (!item) continue;
      const value = incoming.result?.trim() || null;
      item.result = value;
      item.flag = resolveFlag(incoming, item, patient?.gender);
      item.notes = incoming.notes?.trim() || null;
      item.completedAt = value ? now : null;
      if (value && actor) item.enteredBy = actor.name;
    }

    const items = this.db.orderTests.filter((i) => i.orderId === id);
    const filled = items.filter((i) => Boolean(i.result)).length;
    if (order.status !== "cancelled") {
      if (filled === items.length && items.length > 0) {
        order.status = "completed";
        order.completedAt = now;
      } else if (filled > 0) {
        order.status = "in_progress";
        order.completedAt = null;
      } else {
        order.status = "pending";
        order.completedAt = null;
      }
    }

    await this.persist();
    return this.hydrate(order, true);
  }

  async deleteOrder(id: string): Promise<boolean> {
    const before = this.db.orders.length;
    this.db.orders = this.db.orders.filter((o) => o.id !== id);
    if (this.db.orders.length === before) return false;
    this.db.orderTests = this.db.orderTests.filter((i) => i.orderId !== id);
    this.db.payments = this.db.payments.filter((p) => p.orderId !== id);
    this.db.samples = this.db.samples.filter((s) => s.orderId !== id);
    await this.persist();
    return true;
  }

  // -------------------------------------------------------------- samples

  async getOrderByBarcode(barcode: string): Promise<OrderWithDetails | undefined> {
    const orderNumber = parseBarcode(barcode);
    if (orderNumber === null) return undefined;

    // Resolved through the order number rather than the barcode string, so a
    // scan still finds orders created before sample tracking — they have no
    // sample row to match against.
    const order = this.db.orders.find((o) => o.orderNumber === orderNumber);
    return order ? this.hydrate(order, true) : undefined;
  }

  async updateSampleStatus(
    orderId: string,
    input: UpdateSampleInput,
    actor: Actor,
  ): Promise<{ sample: Sample; order: OrderWithDetails } | { error: string } | undefined> {
    const sample = this.db.samples.find((s) => s.orderId === orderId);
    if (!sample) return undefined;

    const from = sample.status;
    if (!canTransition(from, input.status)) return { error: transitionError(from, input.status) };

    const now = new Date().toISOString();
    sample.status = input.status;

    // Each hand-off stamps its own fields, so the tube keeps its full history
    // rather than only its latest actor. A step back clears the stamp it is
    // undoing — otherwise a corrected mis-click would leave a collection time
    // for a tube that, as far as the lab is concerned, was never drawn.
    switch (input.status) {
      case "olindi":
        sample.collectedAt = now;
        sample.collectedBy = actor.id;
        sample.collectedByName = actor.name;
        sample.receivedAt = null;
        sample.receivedBy = null;
        sample.receivedByName = null;
        break;
      case "qabul_qilindi":
        sample.receivedAt = now;
        sample.receivedBy = actor.id;
        sample.receivedByName = actor.name;
        break;
      case "kutilmoqda":
        sample.collectedAt = null;
        sample.collectedBy = null;
        sample.collectedByName = null;
        sample.receivedAt = null;
        sample.receivedBy = null;
        sample.receivedByName = null;
        break;
      case "rad_etildi":
        sample.rejectedAt = now;
        sample.rejectedBy = actor.id;
        sample.rejectedByName = actor.name;
        // Validated upstream: rejectReason is required for this status.
        sample.rejectReason = input.rejectReason ?? null;
        sample.rejectNote = input.rejectNote ?? null;
        break;
    }

    await this.persist();

    const order = this.hydrate(this.db.orders.find((o) => o.id === orderId)!, true);
    return { sample, order };
  }

  // ------------------------------------------------------------- payments

  async addPayment(
    orderId: string,
    input: CreatePaymentInput,
    actor: Actor,
  ): Promise<OrderWithDetails | undefined> {
    const order = this.db.orders.find((o) => o.id === orderId);
    if (!order) return undefined;

    const paid = this.db.payments
      .filter((p) => p.orderId === orderId)
      .reduce((s, p) => s + p.amount, 0);

    // Neither direction may take the ledger somewhere impossible: no paying
    // past the bill, no refunding money that was never taken.
    const room = order.totalAmount - paid;
    const amount = input.amount > 0 ? Math.min(input.amount, room) : Math.max(input.amount, -paid);
    if (amount === 0) {
      throw new Error(
        input.amount > 0 ? "Buyurtma allaqachon to'liq to'langan" : "Qaytariladigan to'lov yo'q",
      );
    }

    this.db.payments.push({
      id: randomUUID(),
      orderId,
      amount,
      method: input.method,
      note: input.note?.trim() || null,
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: new Date().toISOString(),
    });
    this.syncPaid(orderId);
    await this.persist();
    return this.hydrate(order, true);
  }

  async deletePayment(paymentId: string): Promise<boolean> {
    const row = this.db.payments.find((p) => p.id === paymentId);
    if (!row) return false;
    this.db.payments = this.db.payments.filter((p) => p.id !== paymentId);
    this.syncPaid(row.orderId);
    await this.persist();
    return true;
  }

  // ------------------------------------------------------------- expenses

  async listExpenses(query: ExpenseQuery = {}): Promise<Paged<Expense> & { total_amount: number }> {
    let rows = [...this.db.expenses];
    if (query.from) rows = rows.filter((e) => e.spentOn >= query.from!);
    if (query.to) rows = rows.filter((e) => e.spentOn <= query.to!);
    rows.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt));

    const total = rows.length;
    const total_amount = rows.reduce((s, e) => s + e.amount, 0);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? total;
    return { items: rows.slice(offset, offset + limit), total, total_amount };
  }

  async createExpense(input: InsertExpense, actor: Actor): Promise<Expense> {
    const row: Expense = {
      id: randomUUID(),
      category: input.category,
      amount: input.amount,
      note: input.note?.trim() || null,
      spentOn: input.spentOn,
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: new Date().toISOString(),
    };
    this.db.expenses.push(row);
    await this.persist();
    return row;
  }

  async deleteExpense(id: string): Promise<boolean> {
    const before = this.db.expenses.length;
    this.db.expenses = this.db.expenses.filter((e) => e.id !== id);
    if (this.db.expenses.length === before) return false;
    await this.persist();
    return true;
  }

  // ---------------------------------------------------------------- audit

  async writeAudit(input: AuditInput): Promise<void> {
    this.db.auditLog.push({
      id: randomUUID(),
      userId: input.actor.id,
      userName: input.actor.name,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    });
    // The log is append-only and unbounded otherwise; a local JSON file is not
    // the place to keep five years of it.
    if (this.db.auditLog.length > 5000) {
      this.db.auditLog = this.db.auditLog.slice(-5000);
    }
    await this.persist();
  }

  async listAudit(query: AuditQuery = {}): Promise<Paged<AuditEntry>> {
    let rows = [...this.db.auditLog];
    if (query.entity) rows = rows.filter((e) => e.entity === query.entity);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = rows.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? total;
    return { items: rows.slice(offset, offset + limit), total };
  }

  // ------------------------------------------------------------- telegram

  async linkTelegram(patientId: string, chatId: string): Promise<Patient | undefined> {
    const patient = this.db.patients.find((p) => p.id === patientId);
    if (!patient) return undefined;
    // One chat belongs to one patient — release it from whoever held it before.
    for (const other of this.db.patients) {
      if (other.id !== patientId && other.telegramChatId === chatId) {
        other.telegramChatId = null;
        other.telegramLinkedAt = null;
      }
    }
    patient.telegramChatId = chatId;
    patient.telegramLinkedAt = new Date().toISOString();
    await this.persist();
    return patient;
  }

  async savePendingContact(input: {
    chatId: string;
    phone: string;
    fullName?: string | null;
    username?: string | null;
  }): Promise<void> {
    const row: TelegramContact = {
      chatId: input.chatId,
      phone: input.phone,
      fullName: input.fullName ?? null,
      username: input.username ?? null,
      createdAt: new Date().toISOString(),
    };
    this.db.telegramContacts = this.db.telegramContacts.filter((c) => c.chatId !== input.chatId);
    this.db.telegramContacts.push(row);
    await this.persist();
  }

  async findPendingContact(phone: string): Promise<TelegramContact | undefined> {
    const digits = nationalPhoneDigits(phone);
    if (digits.length !== 9) return undefined;
    return [...this.db.telegramContacts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((c) => nationalPhoneDigits(c.phone) === digits);
  }

  async deletePendingContact(chatId: string): Promise<void> {
    const before = this.db.telegramContacts.length;
    this.db.telegramContacts = this.db.telegramContacts.filter((c) => c.chatId !== chatId);
    if (this.db.telegramContacts.length !== before) await this.persist();
  }

  async unlinkTelegram(chatId: string): Promise<number> {
    let count = 0;
    for (const p of this.db.patients) {
      if (p.telegramChatId === chatId) {
        p.telegramChatId = null;
        p.telegramLinkedAt = null;
        count += 1;
      }
    }
    if (count) await this.persist();
    return count;
  }

  async listUndeliveredOrders(patientId: string, limit = 5): Promise<OrderWithDetails[]> {
    return this.db.orders
      .filter((o) => o.patientId === patientId && o.status === "completed" && !o.telegramSentAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((o) => this.hydrate(o));
  }

  async markTelegramSent(orderId: string): Promise<void> {
    const order = this.db.orders.find((o) => o.id === orderId);
    if (!order) return;
    order.telegramSentAt = new Date().toISOString();
    await this.persist();
  }

  // ------------------------------------------------------------ reporting

  async getDashboardStats(): Promise<DashboardStatsData> {
    const today = todayKey();
    const todayOrders = this.db.orders.filter(
      (o) => localDay(o.createdAt) === today && o.status !== "cancelled",
    );
    const activeOrderIds = new Set(
      this.db.orders.filter((o) => o.status !== "cancelled").map((o) => o.id),
    );
    const activeItems = this.db.orderTests.filter((i) => activeOrderIds.has(i.orderId));

    return {
      todayPatients: new Set(todayOrders.map((o) => o.patientId)).size,
      pendingTests: activeItems.filter((i) => !i.result).length,
      readyTests: activeItems.filter((i) => Boolean(i.result)).length,
      todayRevenue: todayOrders.reduce((sum, o) => sum + o.paidAmount, 0),
      totalPatients: this.db.patients.length,
      unpaidAmount: this.db.orders
        .filter((o) => o.status !== "cancelled")
        .reduce((sum, o) => sum + Math.max(0, o.totalAmount - o.paidAmount), 0),
    };
  }

  async getRevenueReport(from: string, to: string): Promise<RevenueReportData> {
    const inRange = this.db.orders.filter((o) => {
      const day = localDay(o.createdAt);
      return day >= from && day <= to && o.status !== "cancelled";
    });

    const byDay = new Map<string, { patients: Set<string>; tests: number; revenue: number }>();
    for (const order of inRange) {
      const day = localDay(order.createdAt);
      const bucket = byDay.get(day) ?? { patients: new Set<string>(), tests: 0, revenue: 0 };
      bucket.patients.add(order.patientId);
      bucket.tests += this.db.orderTests.filter((i) => i.orderId === order.id).length;
      bucket.revenue += order.totalAmount;
      byDay.set(day, bucket);
    }

    const points = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({ date, patients: b.patients.size, tests: b.tests, revenue: b.revenue }));

    const orderIds = new Set(inRange.map((o) => o.id));
    const items = this.db.orderTests.filter((i) => orderIds.has(i.orderId));

    const testAgg = new Map<string, { count: number; revenue: number }>();
    const catAgg = new Map<string, { count: number; revenue: number }>();
    for (const item of items) {
      const t = testAgg.get(item.testName) ?? { count: 0, revenue: 0 };
      t.count += 1;
      t.revenue += item.price;
      testAgg.set(item.testName, t);

      const category = this.db.tests.find((x) => x.id === item.testId)?.category ?? "Boshqa";
      const c = catAgg.get(category) ?? { count: 0, revenue: 0 };
      c.count += 1;
      c.revenue += item.price;
      catAgg.set(category, c);
    }

    const refAgg = new Map<string, { patients: Set<string>; revenue: number }>();
    for (const order of inRange) {
      const key = order.referrer?.trim() || "—";
      const bucket = refAgg.get(key) ?? { patients: new Set<string>(), revenue: 0 };
      bucket.patients.add(order.patientId);
      bucket.revenue += order.totalAmount;
      refAgg.set(key, bucket);
    }

    const spent = this.db.expenses.filter((e) => e.spentOn >= from && e.spentOn <= to);
    const totalExpenses = spent.reduce((s, e) => s + e.amount, 0);
    const expAgg = new Map<string, number>();
    for (const e of spent) expAgg.set(e.category, (expAgg.get(e.category) ?? 0) + e.amount);

    const totalPaid = inRange.reduce((s, o) => s + o.paidAmount, 0);

    return {
      range: { from, to },
      points,
      totalRevenue: inRange.reduce((s, o) => s + o.totalAmount, 0),
      totalPaid,
      totalPatients: new Set(inRange.map((o) => o.patientId)).size,
      totalTests: items.length,
      topTests: Array.from(testAgg.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      byCategory: Array.from(catAgg.entries())
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
      totalExpenses,
      // Against money actually collected, not invoiced: an unpaid bill is not
      // cash the lab can spend.
      netProfit: totalPaid - totalExpenses,
      expensesByCategory: Array.from(expAgg.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      byReferrer: Array.from(refAgg.entries())
        .map(([referrer, v]) => ({ referrer, patients: v.patients.size, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
    };
  }

  // ------------------------------------------------------------- settings

  async getSettings(): Promise<LabSettings> {
    return this.db.settings;
  }

  async updateSettings(input: LabSettingsInput): Promise<LabSettings> {
    this.db.settings = {
      ...this.db.settings,
      labName: input.labName,
      tagline: input.tagline,
      address: input.address ?? null,
      phone: input.phone ?? null,
      director: input.director ?? null,
      licenseNumber: input.licenseNumber ?? null,
    };
    await this.persist();
    return this.db.settings;
  }
}
