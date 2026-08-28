import { computeFlag } from "@shared/reference-range";
import type { LockState } from "@shared/lockout";
import type {
  AuditEntry,
  CreatePaymentInput,
  DashboardStatsData,
  Expense,
  InsertExpense,
  InsertPatient,
  InsertTest,
  InsertUser,
  LabSettings,
  LabSettingsInput,
  OrderListResponse,
  OrderStatus,
  OrderWithDetails,
  Paged,
  Patient,
  PublicUser,
  ResultFlag,
  RevenueReportData,
  Sample,
  TelegramContact,
  Test,
  UpdateOrderInput,
  UpdateSampleInput,
  UpdateUserInput,
  User,
} from "@shared/schema";

/** Local (not UTC) calendar day — the lab's own day is what reports count. */
export function localDay(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return localDay(new Date());
}

export type PatientQuery = { search?: string; limit?: number; offset?: number };

export type OrderQuery = {
  search?: string;
  status?: OrderStatus;
  patientId?: string;
  from?: string;
  to?: string;
  /** The results workbench: "waiting" still has empty results, "ready" has none. */
  queue?: "waiting" | "ready";
  limit?: number;
  offset?: number;
};

export type { Paged };

export type CreateOrderArgs = {
  patientId: string;
  testIds: string[];
  discount: number;
  paidAmount: number;
  notes?: string | null;
  referrer?: string | null;
  createdBy?: string | null;
};

export type ResultInput = {
  id: string;
  result?: string | null;
  flag?: string | null;
  notes?: string | null;
};

/**
 * The flag to store for one result line.
 *
 * A flag the laborant actually chose always wins — they can see the sample and
 * the machine, this code can only see a string. Auto-detection therefore only
 * *fills a blank*: it never overrules, and it never clears a human's choice
 * into "normal". When the range cannot be read for this patient the line simply
 * stays unflagged, which is the honest answer and leaves the manual buttons to
 * do their job.
 */
export function resolveFlag(
  incoming: ResultInput,
  line: { referenceRange: string | null },
  gender: string | null | undefined,
): ResultFlag | null {
  if (incoming.flag) return incoming.flag as ResultFlag;
  return computeFlag(incoming.result, line.referenceRange, { gender });
}

/** Who is performing the write — carried into payments, expenses and the log. */
export type Actor = { id: string | null; name: string };

export type ExpenseQuery = { from?: string; to?: string; limit?: number; offset?: number };

export type AuditQuery = { entity?: string; limit?: number; offset?: number };

export type AuditInput = {
  actor: Actor;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
};

export const DEFAULT_SETTINGS: LabSettings = {
  id: "default",
  labName: "MedLab",
  tagline: "Tibbiy Laboratoriya",
  address: null,
  phone: null,
  director: null,
  licenseNumber: null,
};

/**
 * Only the administrator is seeded. Registrator and laborant accounts are
 * created by the admin from Sozlamalar → Foydalanuvchilar; the roles
 * themselves stay fully supported.
 */
export const SEED_USERS: { username: string; password: string; fullName: string; role: User["role"] }[] = [
  // A single word on purpose: the dashboard greets people by their given name,
  // which it takes to be the second word of "Familiya Ism Otasining-ismi".
  // A two-word job title would come out as "Salom, administratori".
  { username: "admin", password: "admin123", fullName: "Administrator", role: "admin" },
];

export interface IStorage {
  seed(): Promise<{ createdTests: number; createdUsers: number }>;

  listUsers(): Promise<PublicUser[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(input: InsertUser): Promise<PublicUser>;
  updateUser(id: string, input: UpdateUserInput): Promise<PublicUser | undefined>;
  deleteUser(id: string): Promise<boolean>;

  /**
   * Writes the lockout counters back onto a user row.
   *
   * Separate from updateUser because it is not an edit anyone performed: it
   * carries no actor, must not touch the password, and has to work for an
   * account nobody is signed in as.
   */
  setLockState(userId: string, state: LockState): Promise<void>;

  listPatients(query?: PatientQuery): Promise<Paged<Patient>>;
  getPatient(id: string): Promise<Patient | undefined>;
  /** Matched on the 9 national digits, so formatting never blocks a match. */
  getPatientByPhone(phone: string): Promise<Patient | undefined>;
  getPatientByChatId(chatId: string): Promise<Patient | undefined>;
  createPatient(input: InsertPatient): Promise<Patient>;
  updatePatient(id: string, input: Partial<InsertPatient>): Promise<Patient | undefined>;
  deletePatient(id: string): Promise<boolean>;

  listTests(opts?: { activeOnly?: boolean }): Promise<Test[]>;
  getTest(id: string): Promise<Test | undefined>;
  createTest(input: InsertTest): Promise<Test>;
  updateTest(id: string, input: Partial<InsertTest>): Promise<Test | undefined>;
  deleteTest(id: string): Promise<boolean>;

  listOrders(query?: OrderQuery): Promise<OrderListResponse>;
  /** Includes the payment ledger; the list endpoints deliberately do not. */
  getOrder(id: string): Promise<OrderWithDetails | undefined>;
  createOrder(input: CreateOrderArgs): Promise<OrderWithDetails>;
  /**
   * `input.testIds`, when given, replaces the order's test list. Lines that
   * already hold a result are never removed — losing an entered value to a
   * mis-click is not recoverable, so the storage layer refuses rather than
   * trusting the caller.
   */
  updateOrder(id: string, input: UpdateOrderInput): Promise<OrderWithDetails | undefined>;
  /** `actor` is stamped on every line this call fills in. */
  saveResults(id: string, results: ResultInput[], actor?: Actor): Promise<OrderWithDetails | undefined>;
  deleteOrder(id: string): Promise<boolean>;

  /**
   * Moves the order's tube to a new status, stamping who did it and when.
   *
   * Returns `{ error }` rather than throwing for a refused transition: an
   * illegal move is an ordinary thing for a user to attempt (two people
   * working the same rack), and the route turns it into a 409 with the message
   * the UI shows. A genuinely missing order still returns undefined.
   */
  updateSampleStatus(
    orderId: string,
    input: UpdateSampleInput,
    actor: Actor,
  ): Promise<{ sample: Sample; order: OrderWithDetails } | { error: string } | undefined>;

  /** Resolves a scanned barcode to its order. Used by the scan box. */
  getOrderByBarcode(barcode: string): Promise<OrderWithDetails | undefined>;

  /** Cash ledger. Adding or removing a row re-derives orders.paidAmount. */
  addPayment(orderId: string, input: CreatePaymentInput, actor: Actor): Promise<OrderWithDetails | undefined>;
  deletePayment(paymentId: string): Promise<boolean>;

  listExpenses(query?: ExpenseQuery): Promise<Paged<Expense> & { total_amount: number }>;
  createExpense(input: InsertExpense, actor: Actor): Promise<Expense>;
  deleteExpense(id: string): Promise<boolean>;

  writeAudit(input: AuditInput): Promise<void>;
  listAudit(query?: AuditQuery): Promise<Paged<AuditEntry>>;

  /** Binds a Telegram chat to a patient; the chat is released from any other. */
  linkTelegram(patientId: string, chatId: string): Promise<Patient | undefined>;
  /** Parks a chat whose phone has no patient yet, so registration can claim it. */
  savePendingContact(input: {
    chatId: string;
    phone: string;
    fullName?: string | null;
    username?: string | null;
  }): Promise<void>;
  /** Used by the registration form and by the claim on patient create. */
  findPendingContact(phone: string): Promise<TelegramContact | undefined>;
  /** Called once the chat is safely linked to a patient — or on /stop. */
  deletePendingContact(chatId: string): Promise<void>;
  /** Called when the patient blocks the bot or asks to stop. */
  unlinkTelegram(chatId: string): Promise<number>;
  /** Completed orders of a patient whose results were never delivered. */
  listUndeliveredOrders(patientId: string, limit?: number): Promise<OrderWithDetails[]>;
  markTelegramSent(orderId: string): Promise<void>;

  getDashboardStats(): Promise<DashboardStatsData>;
  getRevenueReport(from: string, to: string): Promise<RevenueReportData>;

  getSettings(): Promise<LabSettings>;
  updateSettings(input: LabSettingsInput): Promise<LabSettings>;
}
