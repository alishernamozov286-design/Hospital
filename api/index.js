var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  ORDER_STATUSES: () => ORDER_STATUSES,
  ORDER_STATUS_LABELS: () => ORDER_STATUS_LABELS,
  RESULT_FLAGS: () => RESULT_FLAGS,
  ROLES: () => ROLES,
  ROLE_LABELS: () => ROLE_LABELS,
  createOrderSchema: () => createOrderSchema,
  insertPatientSchema: () => insertPatientSchema,
  insertTestSchema: () => insertTestSchema,
  insertUserSchema: () => insertUserSchema,
  labSettings: () => labSettings,
  labSettingsSchema: () => labSettingsSchema,
  loginSchema: () => loginSchema,
  nationalPhoneDigits: () => nationalPhoneDigits,
  normalizeUzPhone: () => normalizeUzPhone,
  orderTests: () => orderTests,
  orders: () => orders,
  patients: () => patients,
  saveResultsSchema: () => saveResultsSchema,
  sessions: () => sessions,
  telegramContacts: () => telegramContacts,
  tests: () => tests,
  updateOrderSchema: () => updateOrderSchema,
  updateUserSchema: () => updateUserSchema,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
function normalizeUzPhone(value) {
  const digits = nationalPhoneDigits(value);
  if (digits.length !== 9) return (value ?? "").trim();
  return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}
function nationalPhoneDigits(value) {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("8")) digits = digits.slice(1);
  return digits.slice(0, 9);
}
var money, isoTimestamp, ROLES, ROLE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, RESULT_FLAGS, users, patients, tests, orders, orderTests, telegramContacts, sessions, labSettings, insertPatientSchema, insertTestSchema, createOrderSchema, updateOrderSchema, saveResultsSchema, insertUserSchema, updateUserSchema, loginSchema, labSettingsSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    money = (name) => integer(name);
    isoTimestamp = (name) => timestamp(name, { mode: "string", withTimezone: true });
    ROLES = ["admin", "registrator", "laborant"];
    ROLE_LABELS = {
      admin: "Administrator",
      registrator: "Registrator",
      laborant: "Laborant"
    };
    ORDER_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
    ORDER_STATUS_LABELS = {
      pending: "Kutilmoqda",
      in_progress: "Jarayonda",
      completed: "Tayyor",
      cancelled: "Bekor qilingan"
    };
    RESULT_FLAGS = ["low", "normal", "high"];
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull(),
      fullName: text("full_name").notNull(),
      role: text("role").notNull().default("registrator"),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: isoTimestamp("created_at").defaultNow().notNull()
    });
    patients = pgTable("patients", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fullName: text("full_name").notNull(),
      phone: text("phone").notNull(),
      address: text("address"),
      age: integer("age"),
      gender: text("gender"),
      createdAt: isoTimestamp("created_at").defaultNow().notNull(),
      // Set by the Telegram bot when the patient shares their contact; null means
      // "not connected yet", and results for them stay queued until they are.
      telegramChatId: text("telegram_chat_id"),
      telegramLinkedAt: isoTimestamp("telegram_linked_at")
    });
    tests = pgTable("tests", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      price: money("price").notNull(),
      category: text("category").notNull(),
      unit: text("unit"),
      referenceRange: text("reference_range"),
      isActive: boolean("is_active").notNull().default(true)
    });
    orders = pgTable("orders", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Human-facing receipt number. Postgres assigns it from an identity
      // sequence so concurrent registrars can never collide on the same number.
      orderNumber: integer("order_number").generatedByDefaultAsIdentity({ startWith: 1001 }).notNull(),
      patientId: varchar("patient_id").notNull(),
      totalAmount: money("total_amount").notNull(),
      discount: money("discount").notNull().default(0),
      paidAmount: money("paid_amount").notNull().default(0),
      status: text("status").notNull().default("pending"),
      notes: text("notes"),
      createdBy: varchar("created_by"),
      createdAt: isoTimestamp("created_at").defaultNow().notNull(),
      completedAt: isoTimestamp("completed_at"),
      // When the ready results were delivered over Telegram. Doubles as the
      // "already sent" guard, so re-saving a result never spams the patient.
      telegramSentAt: isoTimestamp("telegram_sent_at")
    });
    orderTests = pgTable("order_tests", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      orderId: varchar("order_id").notNull(),
      testId: varchar("test_id").notNull(),
      // Snapshot of the catalogue row, so later price/name edits never rewrite history.
      testName: text("test_name").notNull(),
      price: money("price").notNull(),
      unit: text("unit"),
      referenceRange: text("reference_range"),
      result: text("result"),
      flag: text("flag"),
      notes: text("notes"),
      completedAt: isoTimestamp("completed_at")
    });
    telegramContacts = pgTable("telegram_contacts", {
      chatId: text("chat_id").primaryKey(),
      phone: text("phone").notNull(),
      /** What Telegram calls them — shown to the registrator as a sanity check. */
      fullName: text("full_name"),
      username: text("username"),
      createdAt: isoTimestamp("created_at").defaultNow().notNull()
    });
    sessions = pgTable(
      "session",
      {
        sid: varchar("sid").primaryKey(),
        sess: json("sess").notNull(),
        expire: timestamp("expire", { precision: 6, mode: "date" }).notNull()
      },
      (t) => ({ expireIdx: index("IDX_session_expire").on(t.expire) })
    );
    labSettings = pgTable("lab_settings", {
      id: varchar("id").primaryKey().default("default"),
      labName: text("lab_name").notNull().default("MedLab"),
      tagline: text("tagline").notNull().default("Tibbiy Laboratoriya"),
      address: text("address"),
      phone: text("phone"),
      director: text("director"),
      licenseNumber: text("license_number")
    });
    insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true, telegramChatId: true, telegramLinkedAt: true }).extend({
      fullName: z.string().trim().min(3, "F.I.Sh kamida 3 ta belgidan iborat bo'lishi kerak"),
      phone: z.string().trim().min(7, "Telefon raqamini to'g'ri kiriting").transform(normalizeUzPhone),
      age: z.coerce.number().int().min(0, "Yosh manfiy bo'lmasligi kerak").max(130, "Yoshni tekshiring").nullish(),
      gender: z.enum(["erkak", "ayol"]).nullish(),
      address: z.string().trim().nullish()
    });
    insertTestSchema = createInsertSchema(tests).omit({ id: true }).extend({
      name: z.string().trim().min(2, "Tahlil nomini kiriting"),
      price: z.coerce.number().int().min(0, "Narx manfiy bo'lmasligi kerak"),
      category: z.string().trim().min(2, "Kategoriyani tanlang"),
      unit: z.string().trim().nullish(),
      referenceRange: z.string().trim().nullish(),
      isActive: z.boolean().default(true)
    });
    createOrderSchema = z.object({
      patientId: z.string().min(1, "Bemorni tanlang"),
      testIds: z.array(z.string()).min(1, "Kamida bitta tahlil tanlang"),
      discount: z.coerce.number().int().min(0).default(0),
      paidAmount: z.coerce.number().int().min(0).default(0),
      notes: z.string().trim().nullish()
    });
    updateOrderSchema = z.object({
      status: z.enum(ORDER_STATUSES).optional(),
      discount: z.coerce.number().int().min(0).optional(),
      paidAmount: z.coerce.number().int().min(0).optional(),
      notes: z.string().trim().nullish()
    });
    saveResultsSchema = z.object({
      results: z.array(
        z.object({
          id: z.string().min(1),
          result: z.string().trim().nullish(),
          flag: z.enum(RESULT_FLAGS).nullish(),
          notes: z.string().trim().nullish()
        })
      ).min(1)
    });
    insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true }).extend({
      username: z.string().trim().min(3, "Login kamida 3 ta belgidan iborat bo'lishi kerak").regex(/^[a-z0-9_.-]+$/i, "Faqat lotin harflari, raqam va _ . - belgilari"),
      password: z.string().min(5, "Parol kamida 5 ta belgidan iborat bo'lishi kerak"),
      fullName: z.string().trim().min(3, "F.I.Sh kiriting"),
      role: z.enum(ROLES),
      isActive: z.boolean().default(true)
    });
    updateUserSchema = insertUserSchema.partial().extend({
      password: z.string().min(5, "Parol kamida 5 ta belgidan iborat bo'lishi kerak").optional().or(z.literal(""))
    });
    loginSchema = z.object({
      username: z.string().trim().min(1, "Loginni kiriting"),
      password: z.string().min(1, "Parolni kiriting")
    });
    labSettingsSchema = z.object({
      labName: z.string().trim().min(2, "Laboratoriya nomini kiriting"),
      tagline: z.string().trim().min(2, "Qisqa tavsif kiriting"),
      address: z.string().trim().nullish(),
      phone: z.string().trim().nullish().transform((v) => v ? normalizeUzPhone(v) : v),
      director: z.string().trim().nullish(),
      licenseNumber: z.string().trim().nullish()
    });
  }
});

// server/password.ts
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, KEY_LEN);
  return `${buf.toString("hex")}.${salt}`;
}
async function verifyPassword(password, stored) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(password, salt, KEY_LEN);
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
var scryptAsync, KEY_LEN;
var init_password = __esm({
  "server/password.ts"() {
    "use strict";
    scryptAsync = promisify(scrypt);
    KEY_LEN = 64;
  }
});

// server/storage-types.ts
function localDay(value) {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayKey() {
  return localDay(/* @__PURE__ */ new Date());
}
var DEFAULT_SETTINGS, SEED_USERS;
var init_storage_types = __esm({
  "server/storage-types.ts"() {
    "use strict";
    DEFAULT_SETTINGS = {
      id: "default",
      labName: "MedLab",
      tagline: "Tibbiy Laboratoriya",
      address: null,
      phone: null,
      director: null,
      licenseNumber: null
    };
    SEED_USERS = [
      // A single word on purpose: the dashboard greets people by their given name,
      // which it takes to be the second word of "Familiya Ism Otasining-ismi".
      // A two-word job title would come out as "Salom, administratori".
      { username: "admin", password: "admin123", fullName: "Administrator", role: "admin" }
    ];
  }
});

// shared/tests-data.ts
var defaultTests, testReferences;
var init_tests_data = __esm({
  "shared/tests-data.ts"() {
    "use strict";
    defaultTests = [
      // Gematologiya
      { id: "1", name: "Umumiy qon tahlili", price: 3e4, category: "Gematologiya" },
      { id: "2", name: "Umumiy qon tahlili l\u0435\u0439koformula, Trombotsitlar bilan", price: 5e4, category: "Gematologiya" },
      { id: "3", name: "Gemoglobin", price: 2e4, category: "Gematologiya" },
      { id: "4", name: "Eritrotsitlar chukish tezligi (ECHT)", price: 2e4, category: "Gematologiya" },
      { id: "5", name: "Qon ivish vaqti (VSK)", price: 2e4, category: "Gematologiya" },
      // Umumiy klinika
      { id: "6", name: "Umumiy siydik tahlili", price: 4e4, category: "Umumiy klinika" },
      { id: "7", name: "Nicheporenko usulida siydik tahlili", price: 4e4, category: "Umumiy klinika" },
      { id: "8", name: "Siydikdagi ut pigmentlarini aniqlash", price: 4e4, category: "Umumiy klinika" },
      { id: "9", name: "Siydikdagi keton tanachalarini aniqlash", price: 4e4, category: "Umumiy klinika" },
      { id: "10", name: "Siydikdagi glyukoza miqdorini aniqlash", price: 4e4, category: "Umumiy klinika" },
      { id: "11", name: "Siydikda oksil miqdorini aniqlash", price: 4e4, category: "Umumiy klinika" },
      // Kaprologiya
      { id: "12", name: "Umumiy ahlat tahlili", price: 3e4, category: "Kaprologiya" },
      { id: "13", name: "Ahlatda gijja tuxumlarini aniqlash", price: 3e4, category: "Kaprologiya" },
      { id: "14", name: "Ahlatni yashirin qonga tekshirish", price: 6e4, category: "Kaprologiya" },
      // Qonning biokimyoviy tahlili
      { id: "15", name: "Umumiy oksil", price: 25e3, category: "Biokimyoviy tahlil" },
      { id: "16", name: "Albumin", price: 35e3, category: "Biokimyoviy tahlil" },
      { id: "17", name: "ALT-Alaninaminotransferaza", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "18", name: "AST-Aspartataminotransferaza", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "19", name: "Billirubin: Umumiy, erkin, bog'langan", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "20", name: "Ishkoriy fosfataza", price: 3e4, category: "Biokimyoviy tahlil" },
      { id: "21", name: "Alfa-amilaza", price: 35e3, category: "Biokimyoviy tahlil" },
      { id: "22", name: "Glyukoza", price: 25e3, category: "Biokimyoviy tahlil" },
      { id: "23", name: "Mochevina", price: 25e3, category: "Biokimyoviy tahlil" },
      { id: "24", name: "Kreatinin", price: 25e3, category: "Biokimyoviy tahlil" },
      { id: "25", name: "MB-KFK-kreatininfosfokinaza", price: 4e4, category: "Biokimyoviy tahlil" },
      { id: "26", name: "Xolesterin", price: 3e4, category: "Biokimyoviy tahlil" },
      { id: "27", name: "Triglitserid", price: 4e4, category: "Biokimyoviy tahlil" },
      { id: "28", name: "Yuqori zichlikdagi lipoproteidlar", price: 45e3, category: "Biokimyoviy tahlil" },
      { id: "29", name: "Past zichlikdagi lipoproteidlar", price: 55e3, category: "Biokimyoviy tahlil" },
      { id: "30", name: "Mochevoy kislota", price: 4e4, category: "Biokimyoviy tahlil" },
      { id: "31", name: "Mochevoy kislota siydikda", price: 5e4, category: "Biokimyoviy tahlil" },
      { id: "32", name: "Kaliy", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "33", name: "Kaltsiy", price: 25e3, category: "Biokimyoviy tahlil" },
      { id: "34", name: "Xlor", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "35", name: "Natriy", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "36", name: "Magniy", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "37", name: "Laktatdegidrogenaza (LDG)", price: 5e4, category: "Biokimyoviy tahlil" },
      { id: "38", name: "Temir", price: 3e4, category: "Biokimyoviy tahlil" },
      { id: "39", name: "Revmatoidli omil", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "40", name: "Antistreptozin-O (ASLO)", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "41", name: "SRB-S-reaktiv oksil", price: 2e4, category: "Biokimyoviy tahlil" },
      { id: "42", name: "Revmatoidli omil miqdoriy", price: 7e4, category: "Biokimyoviy tahlil" },
      { id: "43", name: "Antistreptozin-O (ASLO) miqdoriy", price: 7e4, category: "Biokimyoviy tahlil" },
      { id: "44", name: "Glikgemoglobin", price: 7e4, category: "Biokimyoviy tahlil" },
      // Koagulogramma
      { id: "45", name: "PTI-Protrombin indeksi", price: 5e4, category: "Koagulogramma" },
      { id: "46", name: "ACHTV-Aktivlangan tromboplastin hosil bo'lish vaqti", price: 25e3, category: "Koagulogramma" },
      { id: "47", name: "Fibrinogen", price: 25e3, category: "Koagulogramma" },
      { id: "48", name: "Trombo-test", price: 1e4, category: "Koagulogramma" },
      // Qalqonsimon bez gormonlari
      { id: "49", name: "T3", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "50", name: "T4", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "51", name: "TTG", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "52", name: "T3-sv", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "53", name: "T4-sv", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "54", name: "At-TPO", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      { id: "55", name: "At-TG", price: 8e4, category: "Qalqonsimon bez gormonlari" },
      // Reproduktiv sistema
      { id: "56", name: "FSG", price: 7e4, category: "Reproduktiv sistema" },
      { id: "57", name: "LG", price: 7e4, category: "Reproduktiv sistema" },
      { id: "58", name: "Prolaktin", price: 9e4, category: "Reproduktiv sistema" },
      { id: "59", name: "Esteradiol", price: 8e4, category: "Reproduktiv sistema" },
      { id: "60", name: "XGCh", price: 6e4, category: "Reproduktiv sistema" },
      { id: "61", name: "AMG-Antimyuleriv gormon", price: 1e5, category: "Reproduktiv sistema" },
      { id: "62", name: "Testosteron", price: 8e4, category: "Reproduktiv sistema" },
      { id: "63", name: "Testosteron-erkin", price: 8e4, category: "Reproduktiv sistema" },
      { id: "64", name: "Progesteron", price: 8e4, category: "Reproduktiv sistema" },
      // Allergiya
      { id: "65", name: "Immunoglobulin E IgG", price: 7e4, category: "Allergiya" },
      // Buyrak usti bezi gormoni
      { id: "66", name: "Kortizol", price: 8e4, category: "Buyrak usti bezi gormoni" },
      // Oshqozon osti bezi gormoni
      { id: "67", name: "Insulin", price: 8e4, category: "Oshqozon osti bezi gormoni" },
      { id: "68", name: "S-Peptid", price: 8e4, category: "Oshqozon osti bezi gormoni" },
      // Gepatologiya
      { id: "69", name: "Gepatit A IgG", price: 6e4, category: "Gepatologiya" },
      { id: "70", name: "HBsAg", price: 2e4, category: "Gepatologiya" },
      { id: "71", name: "Anti-HCV", price: 2e4, category: "Gepatologiya" },
      { id: "72", name: "Gepatit D", price: 9e4, category: "Gepatologiya" },
      // Infeksiyalar
      { id: "73", name: "Gerpes 1-2 tip IgG", price: 6e4, category: "Infeksiyalar" },
      { id: "74", name: "Tsitomegalovirus IgG", price: 6e4, category: "Infeksiyalar" },
      { id: "75", name: "Xlamidiya IgG", price: 6e4, category: "Infeksiyalar" },
      { id: "76", name: "Toksoplazma IgG", price: 6e4, category: "Infeksiyalar" },
      { id: "77", name: "Mikoplazma IgG", price: 6e4, category: "Infeksiyalar" },
      { id: "78", name: "Ureoplazma IgG", price: 6e4, category: "Infeksiyalar" },
      // Ovqat hazm qilish sistemasi
      { id: "79", name: "Helikobakter pilori IgG", price: 7e4, category: "Ovqat hazm qilish sistemasi" },
      // Gelmintlar
      { id: "80", name: "Exinokokk IgG", price: 7e4, category: "Gelmintlar" },
      { id: "81", name: "Lyambliya IgA,M,G", price: 7e4, category: "Gelmintlar" },
      { id: "82", name: "Askarida IgG", price: 7e4, category: "Gelmintlar" },
      { id: "83", name: "Gelmintlar: Opistorxoz, Trixinella, Toksokar IgG", price: 7e4, category: "Gelmintlar" },
      // Onkomarker
      { id: "84", name: "CA-125Ag - tuxumdonlar onkomarkeri", price: 8e4, category: "Onkomarker" },
      { id: "85", name: "CA-15-3Ag - sut bezi onkomarkeri", price: 8e4, category: "Onkomarker" },
      { id: "86", name: "CA-19-9Ag - oshqozon osti bezi onkomarkeri", price: 8e4, category: "Onkomarker" },
      { id: "87", name: "REA - Rakoviy-embrional antigen", price: 8e4, category: "Onkomarker" },
      { id: "88", name: "AFP - Alfa-fetoprotein", price: 8e4, category: "Onkomarker" },
      { id: "89", name: "PSA - prostata spetsifik antigeni", price: 8e4, category: "Onkomarker" },
      // Yallig'lanish jarayoni
      { id: "90", name: "S-Reaktiv oksil miqdoriy", price: 85e3, category: "Yallig'lanish jarayoni" },
      { id: "91", name: "Prokalsitonin", price: 14e4, category: "Yallig'lanish jarayoni" },
      { id: "92", name: "Interleikin-6", price: 23e4, category: "Yallig'lanish jarayoni" },
      { id: "93", name: "Ferritin", price: 13e4, category: "Yallig'lanish jarayoni" },
      { id: "94", name: "ATSTSP", price: 22e4, category: "Yallig'lanish jarayoni" },
      { id: "95", name: "ANA-HEp-2", price: 25e4, category: "Yallig'lanish jarayoni" },
      // Qon ivish sistemasi
      { id: "96", name: "D-Dimer", price: 13e4, category: "Qon ivish sistemasi" },
      // Suv-tuz almashinuvi
      { id: "97", name: "Vitamin D3", price: 12e4, category: "Suv-tuz almashinuvi" },
      // Ekspress testlar - Gepatologiya
      { id: "98", name: "Gepatit B ekspress", price: 3e4, category: "Ekspress testlar" },
      { id: "99", name: "Gepatit C ekspress", price: 3e4, category: "Ekspress testlar" },
      { id: "100", name: "Gepatit A IgM (ekspress)", price: 8e4, category: "Ekspress testlar" },
      // Jinsiy yo'l bilan yuqadigan kasalliklar
      { id: "101", name: "Siflis ekspress", price: 7e4, category: "Jinsiy yo'l bilan yuqadigan kasalliklar" },
      { id: "102", name: "OIV ekspress", price: 7e4, category: "Jinsiy yo'l bilan yuqadigan kasalliklar" },
      // Zoonoz infeksiyalar
      { id: "103", name: "Brutsellyoz", price: 8e4, category: "Zoonoz infeksiyalar" },
      // Pulmanologiya
      { id: "104", name: "Tuberkulyoz", price: 9e4, category: "Pulmanologiya" },
      // n-COV-19
      { id: "105", name: "n-COV-19 Ag-surtma", price: 6e4, category: "COVID-19" },
      { id: "106", name: "n-COV-19 IgM-IgG-qonda", price: 6e4, category: "COVID-19" },
      // Kardiologiya
      { id: "107", name: "Troponin", price: 5e4, category: "Kardiologiya" },
      // PTsR
      { id: "108", name: "Gepatit-B sifatiy", price: 22e4, category: "PTsR" },
      { id: "109", name: "Gepatit-B miqdoriy", price: 22e4, category: "PTsR" },
      { id: "110", name: "Gepatit-S sifatiy", price: 22e4, category: "PTsR" },
      { id: "111", name: "Gepatit-S miqdoriy", price: 28e4, category: "PTsR" },
      { id: "112", name: "Gepatit-S Genotip", price: 27e4, category: "PTsR" },
      { id: "113", name: "Gepatit-D miqdoriy", price: 27e4, category: "PTsR" },
      // IXLA
      { id: "114", name: "T3 (IXLA)", price: 8e4, category: "IXLA" },
      { id: "115", name: "T4 (IXLA)", price: 8e4, category: "IXLA" },
      { id: "116", name: "FT3 (IXLA)", price: 8e4, category: "IXLA" },
      { id: "117", name: "FT4 (IXLA)", price: 8e4, category: "IXLA" },
      { id: "118", name: "TTG (IXLA)", price: 8e4, category: "IXLA" },
      { id: "119", name: "At-TPO (IXLA)", price: 8e4, category: "IXLA" }
    ];
    testReferences = {
      "3": { unit: "g/l", referenceRange: "Erkak: 130-170, Ayol: 120-150" },
      "4": { unit: "mm/soat", referenceRange: "Erkak: 2-10, Ayol: 2-15" },
      "5": { unit: "daqiqa", referenceRange: "5-10" },
      "15": { unit: "g/l", referenceRange: "64-83" },
      "16": { unit: "g/l", referenceRange: "35-52" },
      "17": { unit: "U/l", referenceRange: "< 41" },
      "18": { unit: "U/l", referenceRange: "< 40" },
      "19": { unit: "mkmol/l", referenceRange: "Umumiy: 3.4-20.5" },
      "20": { unit: "U/l", referenceRange: "40-150" },
      "21": { unit: "U/l", referenceRange: "28-100" },
      "22": { unit: "mmol/l", referenceRange: "3.9-6.1" },
      "23": { unit: "mmol/l", referenceRange: "2.5-8.3" },
      "24": { unit: "mkmol/l", referenceRange: "Erkak: 62-106, Ayol: 44-80" },
      "25": { unit: "U/l", referenceRange: "< 25" },
      "26": { unit: "mmol/l", referenceRange: "< 5.2" },
      "27": { unit: "mmol/l", referenceRange: "< 1.7" },
      "28": { unit: "mmol/l", referenceRange: "Erkak: > 1.0, Ayol: > 1.2" },
      "29": { unit: "mmol/l", referenceRange: "< 3.0" },
      "30": { unit: "mkmol/l", referenceRange: "Erkak: 202-416, Ayol: 143-339" },
      "32": { unit: "mmol/l", referenceRange: "3.5-5.1" },
      "33": { unit: "mmol/l", referenceRange: "2.15-2.55" },
      "34": { unit: "mmol/l", referenceRange: "98-107" },
      "35": { unit: "mmol/l", referenceRange: "136-145" },
      "36": { unit: "mmol/l", referenceRange: "0.66-1.07" },
      "37": { unit: "U/l", referenceRange: "125-220" },
      "38": { unit: "mkmol/l", referenceRange: "Erkak: 11-28, Ayol: 7-26" },
      "39": { referenceRange: "Manfiy" },
      "40": { referenceRange: "Manfiy" },
      "41": { referenceRange: "Manfiy" },
      "42": { unit: "ME/ml", referenceRange: "< 14" },
      "43": { unit: "ME/ml", referenceRange: "< 200" },
      "44": { unit: "%", referenceRange: "4.0-6.0" },
      "45": { unit: "%", referenceRange: "70-130" },
      "46": { unit: "sek", referenceRange: "25-35" },
      "47": { unit: "g/l", referenceRange: "2.0-4.0" },
      "49": { unit: "nmol/l", referenceRange: "1.3-2.7" },
      "50": { unit: "nmol/l", referenceRange: "66-181" },
      "51": { unit: "mkME/ml", referenceRange: "0.4-4.0" },
      "52": { unit: "pmol/l", referenceRange: "3.1-6.8" },
      "53": { unit: "pmol/l", referenceRange: "12-22" },
      "54": { unit: "ME/ml", referenceRange: "< 34" },
      "55": { unit: "ME/ml", referenceRange: "< 115" },
      "58": { unit: "ng/ml", referenceRange: "Erkak: 2.6-13.1, Ayol: 3.3-26.7" },
      "60": { unit: "mME/ml", referenceRange: "Homilador emas: < 5" },
      "62": { unit: "nmol/l", referenceRange: "Erkak: 8.6-29, Ayol: 0.3-2.4" },
      "66": { unit: "nmol/l", referenceRange: "Ertalab: 171-536" },
      "67": { unit: "mkME/ml", referenceRange: "2.6-24.9" },
      "70": { referenceRange: "Manfiy" },
      "71": { referenceRange: "Manfiy" },
      "84": { unit: "U/ml", referenceRange: "< 35" },
      "85": { unit: "U/ml", referenceRange: "< 31.3" },
      "86": { unit: "U/ml", referenceRange: "< 37" },
      "87": { unit: "ng/ml", referenceRange: "< 5" },
      "88": { unit: "ME/ml", referenceRange: "< 10" },
      "89": { unit: "ng/ml", referenceRange: "< 4.0" },
      "90": { unit: "mg/l", referenceRange: "< 5" },
      "91": { unit: "ng/ml", referenceRange: "< 0.5" },
      "92": { unit: "pg/ml", referenceRange: "< 7" },
      "93": { unit: "ng/ml", referenceRange: "Erkak: 30-400, Ayol: 13-150" },
      "96": { unit: "ng/ml", referenceRange: "< 500" },
      "97": { unit: "ng/ml", referenceRange: "30-100" },
      "98": { referenceRange: "Manfiy" },
      "99": { referenceRange: "Manfiy" },
      "101": { referenceRange: "Manfiy" },
      "102": { referenceRange: "Manfiy" },
      "103": { referenceRange: "Manfiy" },
      "104": { referenceRange: "Manfiy" },
      "105": { referenceRange: "Manfiy" },
      "106": { referenceRange: "Manfiy" },
      "107": { unit: "ng/ml", referenceRange: "< 0.04" },
      "114": { unit: "nmol/l", referenceRange: "1.3-2.7" },
      "115": { unit: "nmol/l", referenceRange: "66-181" },
      "116": { unit: "pmol/l", referenceRange: "3.1-6.8" },
      "117": { unit: "pmol/l", referenceRange: "12-22" },
      "118": { unit: "mkME/ml", referenceRange: "0.4-4.0" },
      "119": { unit: "ME/ml", referenceRange: "< 34" }
    };
  }
});

// server/db-pg.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
var pool, db;
var init_db_pg = __esm({
  "server/db-pg.ts"() {
    "use strict";
    init_schema();
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL topilmadi \u2014 .env faylini tekshiring");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on("error", (err) => {
      console.error("[db] pool xatosi (so'rov qayta uriniladi):", err.message);
    });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/storage-pg.ts
var storage_pg_exports = {};
__export(storage_pg_exports, {
  PgStorage: () => PgStorage
});
import { and, asc, desc, eq, gte, inArray, lte, or, sql as sql2 } from "drizzle-orm";
var iso, mapUser, mapPatient, mapOrder, mapItem, strip, dayExpr, PgStorage;
var init_storage_pg = __esm({
  "server/storage-pg.ts"() {
    "use strict";
    init_tests_data();
    init_schema();
    init_db_pg();
    init_password();
    init_storage_types();
    iso = (value) => value ? new Date(value).toISOString() : value;
    mapUser = (row) => ({ ...row, createdAt: iso(row.createdAt) });
    mapPatient = (row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      telegramLinkedAt: iso(row.telegramLinkedAt)
    });
    mapOrder = (row) => ({
      ...row,
      status: row.status,
      createdAt: iso(row.createdAt),
      completedAt: iso(row.completedAt),
      telegramSentAt: iso(row.telegramSentAt)
    });
    mapItem = (row) => ({
      ...row,
      flag: row.flag,
      completedAt: iso(row.completedAt)
    });
    strip = (user) => {
      const { password: _password, ...pub } = mapUser(user);
      return pub;
    };
    dayExpr = sql2`(${orders.createdAt} AT TIME ZONE current_setting('TIMEZONE'))::date`;
    PgStorage = class {
      async seed() {
        let createdTests = 0;
        const [{ count: testCount }] = await db.select({ count: sql2`count(*)::int` }).from(tests);
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
              isActive: true
            };
          });
          await db.insert(tests).values(rows);
          createdTests = rows.length;
        }
        let createdUsers = 0;
        const [{ count: userCount }] = await db.select({ count: sql2`count(*)::int` }).from(users);
        if (userCount === 0) {
          for (const u of SEED_USERS) {
            await db.insert(users).values({
              username: u.username,
              password: await hashPassword(u.password),
              fullName: u.fullName,
              role: u.role,
              isActive: true
            });
          }
          createdUsers = SEED_USERS.length;
        }
        const existing = await db.select().from(labSettings).limit(1);
        if (existing.length === 0) {
          await db.insert(labSettings).values(DEFAULT_SETTINGS);
        }
        return { createdTests, createdUsers };
      }
      // ---------------------------------------------------------------- users
      async listUsers() {
        const rows = await db.select().from(users).orderBy(asc(users.fullName));
        return rows.map(strip);
      }
      async getUser(id) {
        const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return row && mapUser(row);
      }
      async getUserByUsername(username) {
        const [row] = await db.select().from(users).where(sql2`lower(${users.username}) = lower(${username})`).limit(1);
        return row && mapUser(row);
      }
      async createUser(input) {
        const [row] = await db.insert(users).values({
          username: input.username,
          password: await hashPassword(input.password),
          fullName: input.fullName,
          role: input.role,
          isActive: input.isActive ?? true
        }).returning();
        return strip(row);
      }
      async updateUser(id, input) {
        const patch = {};
        if (input.username) patch.username = input.username;
        if (input.fullName) patch.fullName = input.fullName;
        if (input.role) patch.role = input.role;
        if (input.isActive !== void 0) patch.isActive = input.isActive;
        if (input.password) patch.password = await hashPassword(input.password);
        if (Object.keys(patch).length === 0) {
          const current = await this.getUser(id);
          return current ? strip(current) : void 0;
        }
        const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
        return row ? strip(row) : void 0;
      }
      async deleteUser(id) {
        const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
        return rows.length > 0;
      }
      // ------------------------------------------------------------- patients
      async listPatients(query = {}) {
        const search = query.search?.trim();
        let where;
        if (search) {
          const like = "%" + search + "%";
          const parts = [
            sql2`${patients.fullName} ILIKE ${like}`,
            sql2`${patients.phone} ILIKE ${like}`,
            sql2`coalesce(${patients.address}, '') ILIKE ${like}`
          ];
          const digits = search.replace(/\D/g, "");
          if (digits.length >= 3) {
            parts.push(sql2`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}`);
          }
          where = or(...parts);
        }
        let q = db.select().from(patients).where(where).orderBy(desc(patients.createdAt)).$dynamic();
        if (query.limit !== void 0) q = q.limit(query.limit);
        if (query.offset) q = q.offset(query.offset);
        const [rows, [{ count }]] = await Promise.all([
          q,
          db.select({ count: sql2`count(*)::int` }).from(patients).where(where)
        ]);
        return { items: rows.map(mapPatient), total: count };
      }
      async getPatient(id) {
        const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
        return row && mapPatient(row);
      }
      async getPatientByPhone(phone) {
        const digits = nationalPhoneDigits(phone);
        if (digits.length !== 9) return void 0;
        const [row] = await db.select().from(patients).where(sql2`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits}`).orderBy(desc(patients.createdAt)).limit(1);
        return row && mapPatient(row);
      }
      async getPatientByChatId(chatId) {
        const [row] = await db.select().from(patients).where(eq(patients.telegramChatId, chatId)).limit(1);
        return row && mapPatient(row);
      }
      async createPatient(input) {
        const [row] = await db.insert(patients).values({
          fullName: input.fullName,
          phone: input.phone,
          address: input.address ?? null,
          age: input.age ?? null,
          gender: input.gender ?? null
        }).returning();
        return mapPatient(row);
      }
      async updatePatient(id, input) {
        const patch = {};
        if (input.fullName !== void 0) patch.fullName = input.fullName;
        if (input.phone !== void 0) patch.phone = input.phone;
        if (input.address !== void 0) patch.address = input.address ?? null;
        if (input.age !== void 0) patch.age = input.age ?? null;
        if (input.gender !== void 0) patch.gender = input.gender ?? null;
        if (Object.keys(patch).length === 0) return this.getPatient(id);
        const [row] = await db.update(patients).set(patch).where(eq(patients.id, id)).returning();
        return row && mapPatient(row);
      }
      async deletePatient(id) {
        const [{ count }] = await db.select({ count: sql2`count(*)::int` }).from(orders).where(eq(orders.patientId, id));
        if (count > 0) {
          throw new Error("Bu bemorda buyurtmalar mavjud \u2014 avval buyurtmalarni o'chiring");
        }
        const rows = await db.delete(patients).where(eq(patients.id, id)).returning({ id: patients.id });
        return rows.length > 0;
      }
      // ---------------------------------------------------------------- tests
      async listTests(opts = {}) {
        return db.select().from(tests).where(opts.activeOnly ? eq(tests.isActive, true) : void 0).orderBy(asc(tests.category), asc(tests.name));
      }
      async getTest(id) {
        const [row] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
        return row;
      }
      async createTest(input) {
        const [row] = await db.insert(tests).values({
          name: input.name,
          price: input.price,
          category: input.category,
          unit: input.unit ?? null,
          referenceRange: input.referenceRange ?? null,
          isActive: input.isActive ?? true
        }).returning();
        return row;
      }
      async updateTest(id, input) {
        const patch = {};
        if (input.name !== void 0) patch.name = input.name;
        if (input.price !== void 0) patch.price = input.price;
        if (input.category !== void 0) patch.category = input.category;
        if (input.unit !== void 0) patch.unit = input.unit ?? null;
        if (input.referenceRange !== void 0) patch.referenceRange = input.referenceRange ?? null;
        if (input.isActive !== void 0) patch.isActive = input.isActive;
        if (Object.keys(patch).length === 0) return this.getTest(id);
        const [row] = await db.update(tests).set(patch).where(eq(tests.id, id)).returning();
        return row;
      }
      async deleteTest(id) {
        const rows = await db.delete(tests).where(eq(tests.id, id)).returning({ id: tests.id });
        return rows.length > 0;
      }
      // --------------------------------------------------------------- orders
      /** Attaches patient + line items to a set of orders in two extra queries. */
      async hydrate(rows) {
        if (rows.length === 0) return [];
        const orderIds = rows.map((o) => o.id);
        const patientIds = Array.from(new Set(rows.map((o) => o.patientId)));
        const [items, people] = await Promise.all([
          db.select().from(orderTests).where(inArray(orderTests.orderId, orderIds)),
          db.select().from(patients).where(inArray(patients.id, patientIds))
        ]);
        const byPatient = new Map(people.map((p) => [p.id, mapPatient(p)]));
        const byOrder = /* @__PURE__ */ new Map();
        for (const item of items) {
          const list = byOrder.get(item.orderId) ?? [];
          list.push(mapItem(item));
          byOrder.set(item.orderId, list);
        }
        return rows.map((row) => ({
          ...mapOrder(row),
          patient: byPatient.get(row.patientId) ?? null,
          items: byOrder.get(row.id) ?? []
        }));
      }
      async listOrders(query = {}) {
        const base = [];
        if (query.patientId) base.push(eq(orders.patientId, query.patientId));
        if (query.from) base.push(gte(dayExpr, sql2`${query.from}::date`));
        if (query.to) base.push(lte(dayExpr, sql2`${query.to}::date`));
        const search = query.search?.trim();
        if (search) {
          const like = "%" + search + "%";
          const digits = search.replace(/\D/g, "");
          const phoneDigits = digits.length >= 3 ? sql2` OR regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}` : sql2``;
          base.push(sql2`(
        EXISTS (SELECT 1 FROM ${patients} p
                WHERE p.id = ${orders.patientId}
                  AND (p.full_name ILIKE ${like} OR p.phone ILIKE ${like}${phoneDigits}))
        OR ${orders.orderNumber}::text ILIKE ${like}
        OR EXISTS (SELECT 1 FROM ${orderTests} ot
                   WHERE ot.order_id = ${orders.id} AND ot.test_name ILIKE ${like})
      )`);
        }
        const baseWhere = base.length ? and(...base) : void 0;
        const notCancelled = sql2`${orders.status} <> 'cancelled'`;
        const hasItems = sql2`EXISTS (SELECT 1 FROM ${orderTests} ot WHERE ot.order_id = ${orders.id})`;
        const hasBlank = sql2`EXISTS (SELECT 1 FROM ${orderTests} ot
                                 WHERE ot.order_id = ${orders.id}
                                   AND (ot.result IS NULL OR ot.result = ''))`;
        const readyExpr = sql2`(${hasItems} AND NOT ${hasBlank})`;
        const conditions = [...base];
        if (query.status) conditions.push(eq(orders.status, query.status));
        if (query.queue) {
          conditions.push(notCancelled);
          conditions.push(query.queue === "waiting" ? hasBlank : readyExpr);
        }
        const where = conditions.length ? and(...conditions) : void 0;
        let q = db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).$dynamic();
        if (query.limit !== void 0) q = q.limit(query.limit);
        if (query.offset) q = q.offset(query.offset);
        const liveBase = baseWhere ? and(baseWhere, notCancelled) : notCancelled;
        const billable = where ? and(where, notCancelled) : notCancelled;
        const [rows, statusRows, [queueRow], [totalsRow], [{ count }]] = await Promise.all([
          q,
          db.select({ status: orders.status, count: sql2`count(*)::int` }).from(orders).where(baseWhere).groupBy(orders.status),
          db.select({
            waiting: sql2`count(*) FILTER (WHERE ${hasBlank})::int`,
            ready: sql2`count(*) FILTER (WHERE ${readyExpr})::int`
          }).from(orders).where(liveBase),
          db.select({
            sum: sql2`coalesce(sum(${orders.totalAmount}), 0)::int`,
            paid: sql2`coalesce(sum(${orders.paidAmount}), 0)::int`
          }).from(orders).where(billable),
          db.select({ count: sql2`count(*)::int` }).from(orders).where(where)
        ]);
        const counts = { all: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        for (const row of statusRows) {
          counts.all += row.count;
          if (row.status in counts) counts[row.status] = row.count;
        }
        const sum = totalsRow?.sum ?? 0;
        const paid = totalsRow?.paid ?? 0;
        return {
          items: await this.hydrate(rows),
          total: count,
          summary: {
            counts,
            results: { waiting: queueRow?.waiting ?? 0, ready: queueRow?.ready ?? 0 },
            totals: { sum, paid, debt: Math.max(0, sum - paid) }
          }
        };
      }
      async getOrder(id) {
        const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        const [hydrated] = await this.hydrate(rows);
        return hydrated;
      }
      async createOrder(input) {
        const patient = await this.getPatient(input.patientId);
        if (!patient) throw new Error("Bemor topilmadi");
        const selected = await db.select().from(tests).where(inArray(tests.id, input.testIds));
        if (selected.length === 0) throw new Error("Tanlangan tahlillar topilmadi");
        const subtotal = selected.reduce((sum, t) => sum + t.price, 0);
        const discount = Math.min(input.discount, subtotal);
        const total = subtotal - discount;
        const orderId = await db.transaction(async (tx) => {
          const [order] = await tx.insert(orders).values({
            patientId: input.patientId,
            totalAmount: total,
            discount,
            paidAmount: Math.min(input.paidAmount, total),
            status: "pending",
            notes: input.notes ?? null,
            createdBy: input.createdBy ?? null
          }).returning({ id: orders.id });
          await tx.insert(orderTests).values(
            selected.map((t) => ({
              orderId: order.id,
              testId: t.id,
              testName: t.name,
              price: t.price,
              unit: t.unit,
              referenceRange: t.referenceRange
            }))
          );
          return order.id;
        });
        return await this.getOrder(orderId);
      }
      async updateOrder(id, input) {
        const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        if (!current) return void 0;
        const patch = {};
        if (input.discount !== void 0) {
          const [{ subtotal }] = await db.select({ subtotal: sql2`coalesce(sum(${orderTests.price}), 0)::int` }).from(orderTests).where(eq(orderTests.orderId, id));
          patch.discount = Math.min(input.discount, subtotal);
          patch.totalAmount = subtotal - patch.discount;
        }
        const effectiveTotal = patch.totalAmount ?? current.totalAmount;
        if (input.paidAmount !== void 0) patch.paidAmount = Math.min(input.paidAmount, effectiveTotal);
        if (input.notes !== void 0) patch.notes = input.notes ?? null;
        if (input.status) {
          patch.status = input.status;
          patch.completedAt = input.status === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : null;
        }
        if (Object.keys(patch).length > 0) {
          await db.update(orders).set(patch).where(eq(orders.id, id));
        }
        return this.getOrder(id);
      }
      async saveResults(id, results) {
        const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        if (!current) return void 0;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await db.transaction(async (tx) => {
          for (const incoming of results) {
            const value = incoming.result?.trim() || null;
            await tx.update(orderTests).set({
              result: value,
              flag: incoming.flag ?? null,
              notes: incoming.notes?.trim() || null,
              completedAt: value ? now : null
            }).where(and(eq(orderTests.id, incoming.id), eq(orderTests.orderId, id)));
          }
          if (current.status !== "cancelled") {
            const [{ total, filled }] = await tx.select({
              total: sql2`count(*)::int`,
              filled: sql2`count(${orderTests.result})::int`
            }).from(orderTests).where(eq(orderTests.orderId, id));
            const status = total > 0 && filled === total ? "completed" : filled > 0 ? "in_progress" : "pending";
            await tx.update(orders).set({ status, completedAt: status === "completed" ? now : null }).where(eq(orders.id, id));
          }
        });
        return this.getOrder(id);
      }
      async deleteOrder(id) {
        return db.transaction(async (tx) => {
          await tx.delete(orderTests).where(eq(orderTests.orderId, id));
          const rows = await tx.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
          return rows.length > 0;
        });
      }
      // ------------------------------------------------------------- telegram
      async linkTelegram(patientId, chatId) {
        await db.update(patients).set({ telegramChatId: null, telegramLinkedAt: null }).where(and(eq(patients.telegramChatId, chatId), sql2`${patients.id} <> ${patientId}`));
        const [row] = await db.update(patients).set({ telegramChatId: chatId, telegramLinkedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(patients.id, patientId)).returning();
        return row && mapPatient(row);
      }
      async savePendingContact(input) {
        const values = {
          chatId: input.chatId,
          phone: input.phone,
          fullName: input.fullName ?? null,
          username: input.username ?? null
        };
        await db.insert(telegramContacts).values(values).onConflictDoUpdate({ target: telegramContacts.chatId, set: values });
      }
      /** Digits-only suffix match, same rule as getPatientByPhone. */
      pendingByPhone(phone) {
        const digits = nationalPhoneDigits(phone);
        if (digits.length !== 9) return void 0;
        return sql2`regexp_replace(${telegramContacts.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits}`;
      }
      async findPendingContact(phone) {
        const where = this.pendingByPhone(phone);
        if (!where) return void 0;
        const [row] = await db.select().from(telegramContacts).where(where).orderBy(desc(telegramContacts.createdAt)).limit(1);
        return row && { ...row, createdAt: iso(row.createdAt) };
      }
      async deletePendingContact(chatId) {
        await db.delete(telegramContacts).where(eq(telegramContacts.chatId, chatId));
      }
      async unlinkTelegram(chatId) {
        const rows = await db.update(patients).set({ telegramChatId: null, telegramLinkedAt: null }).where(eq(patients.telegramChatId, chatId)).returning({ id: patients.id });
        return rows.length;
      }
      async listUndeliveredOrders(patientId, limit = 5) {
        const rows = await db.select().from(orders).where(
          and(
            eq(orders.patientId, patientId),
            eq(orders.status, "completed"),
            sql2`${orders.telegramSentAt} IS NULL`
          )
        ).orderBy(desc(orders.createdAt)).limit(limit);
        return this.hydrate(rows);
      }
      async markTelegramSent(orderId) {
        await db.update(orders).set({ telegramSentAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(orders.id, orderId));
      }
      // ------------------------------------------------------------ reporting
      async getDashboardStats() {
        const today = todayKey();
        const { rows } = await db.execute(sql2`
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
          unpaidAmount: r?.unpaid ?? 0
        };
      }
      async getRevenueReport(from, to) {
        const inRange = and(
          sql2`${orders.status} <> 'cancelled'`,
          gte(dayExpr, sql2`${from}::date`),
          lte(dayExpr, sql2`${to}::date`)
        );
        const [orderDays, testDays] = await Promise.all([
          db.select({
            date: sql2`to_char(${dayExpr}, 'YYYY-MM-DD')`,
            patients: sql2`count(distinct ${orders.patientId})::int`,
            revenue: sql2`coalesce(sum(${orders.totalAmount}), 0)::int`
          }).from(orders).where(inRange).groupBy(dayExpr).orderBy(asc(dayExpr)),
          db.select({
            date: sql2`to_char(${dayExpr}, 'YYYY-MM-DD')`,
            tests: sql2`count(*)::int`
          }).from(orderTests).innerJoin(orders, eq(orders.id, orderTests.orderId)).where(inRange).groupBy(dayExpr)
        ]);
        const testsByDay = new Map(testDays.map((r) => [r.date, r.tests]));
        const points = orderDays.map((d) => ({ ...d, tests: testsByDay.get(d.date) ?? 0 }));
        const [[totals], topTests, byCategory] = await Promise.all([
          db.select({
            totalRevenue: sql2`coalesce(sum(${orders.totalAmount}), 0)::int`,
            totalPaid: sql2`coalesce(sum(${orders.paidAmount}), 0)::int`,
            totalPatients: sql2`count(distinct ${orders.patientId})::int`
          }).from(orders).where(inRange),
          db.select({
            name: orderTests.testName,
            count: sql2`count(*)::int`,
            revenue: sql2`coalesce(sum(${orderTests.price}), 0)::int`
          }).from(orderTests).innerJoin(orders, eq(orders.id, orderTests.orderId)).where(inRange).groupBy(orderTests.testName).orderBy(desc(sql2`sum(${orderTests.price})`)).limit(8),
          db.select({
            category: sql2`coalesce(${tests.category}, 'Boshqa')`,
            count: sql2`count(*)::int`,
            revenue: sql2`coalesce(sum(${orderTests.price}), 0)::int`
          }).from(orderTests).innerJoin(orders, eq(orders.id, orderTests.orderId)).leftJoin(tests, eq(tests.id, orderTests.testId)).where(inRange).groupBy(sql2`coalesce(${tests.category}, 'Boshqa')`).orderBy(desc(sql2`sum(${orderTests.price})`))
        ]);
        const totalTests = byCategory.reduce((sum, c) => sum + c.count, 0);
        return {
          range: { from, to },
          points,
          totalRevenue: totals?.totalRevenue ?? 0,
          totalPaid: totals?.totalPaid ?? 0,
          totalPatients: totals?.totalPatients ?? 0,
          totalTests,
          topTests,
          byCategory
        };
      }
      // ------------------------------------------------------------- settings
      async getSettings() {
        const [row] = await db.select().from(labSettings).limit(1);
        return row ?? DEFAULT_SETTINGS;
      }
      async updateSettings(input) {
        const values = {
          id: "default",
          labName: input.labName,
          tagline: input.tagline,
          address: input.address ?? null,
          phone: input.phone ?? null,
          director: input.director ?? null,
          licenseNumber: input.licenseNumber ?? null
        };
        const [row] = await db.insert(labSettings).values(values).onConflictDoUpdate({ target: labSettings.id, set: values }).returning();
        return row;
      }
    };
  }
});

// server/db.ts
import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
function readDbSync() {
  try {
    const raw = fsSync.readFileSync(DB_FILE, "utf8");
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    return emptyDb();
  }
}
function writeDb(db2) {
  queue = queue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TMP_FILE, JSON.stringify(db2, null, 2), "utf8");
    await fs.rename(TMP_FILE, DB_FILE);
  });
  return queue;
}
var DATA_DIR, DB_FILE, TMP_FILE, emptyDb, queue;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    DATA_DIR = path.resolve(import.meta.dirname, "..", ".data");
    DB_FILE = path.join(DATA_DIR, "db.json");
    TMP_FILE = path.join(DATA_DIR, "db.tmp.json");
    emptyDb = () => ({
      users: [],
      patients: [],
      tests: [],
      orders: [],
      orderTests: [],
      telegramContacts: [],
      settings: {
        id: "default",
        labName: "MedLab",
        tagline: "Tibbiy Laboratoriya",
        address: "Toshkent sh., Chilonzor t., 12-mavze",
        phone: "+998 71 200 00 00",
        director: null,
        licenseNumber: null
      },
      counters: { orderNumber: 1e3 }
    });
    queue = Promise.resolve();
  }
});

// server/storage-file.ts
var storage_file_exports = {};
__export(storage_file_exports, {
  FileStorage: () => FileStorage
});
import { randomUUID } from "crypto";
function contains(haystack, needle) {
  return (haystack ?? "").toLowerCase().includes(needle);
}
function phoneContains(phone, search) {
  const needle = digitsOf(search);
  return needle.length >= 3 && digitsOf(phone).includes(needle);
}
function isWaiting(order) {
  return order.items.some((i) => !i.result);
}
function isReady(order) {
  return order.items.length > 0 && order.items.every((i) => i.result);
}
var digitsOf, FileStorage;
var init_storage_file = __esm({
  "server/storage-file.ts"() {
    "use strict";
    init_tests_data();
    init_schema();
    init_db();
    init_password();
    init_storage_types();
    digitsOf = (value) => (value ?? "").replace(/\D/g, "");
    FileStorage = class {
      db;
      constructor() {
        this.db = readDbSync();
      }
      persist() {
        return writeDb(this.db);
      }
      async seed() {
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
              isActive: true
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
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          createdUsers = SEED_USERS.length;
        }
        if (createdTests || createdUsers) await this.persist();
        return { createdTests, createdUsers };
      }
      // ---------------------------------------------------------------- users
      async listUsers() {
        return this.db.users.map(({ password: _password, ...rest }) => rest).sort((a, b) => a.fullName.localeCompare(b.fullName));
      }
      async getUser(id) {
        return this.db.users.find((u) => u.id === id);
      }
      async getUserByUsername(username) {
        return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      }
      async createUser(input) {
        const user = {
          id: randomUUID(),
          username: input.username,
          password: await hashPassword(input.password),
          fullName: input.fullName,
          role: input.role,
          isActive: input.isActive ?? true,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.db.users.push(user);
        await this.persist();
        const { password: _password, ...pub } = user;
        return pub;
      }
      async updateUser(id, input) {
        const user = this.db.users.find((u) => u.id === id);
        if (!user) return void 0;
        if (input.username) user.username = input.username;
        if (input.fullName) user.fullName = input.fullName;
        if (input.role) user.role = input.role;
        if (input.isActive !== void 0) user.isActive = input.isActive;
        if (input.password) user.password = await hashPassword(input.password);
        await this.persist();
        const { password: _password, ...pub } = user;
        return pub;
      }
      async deleteUser(id) {
        const before = this.db.users.length;
        this.db.users = this.db.users.filter((u) => u.id !== id);
        if (this.db.users.length === before) return false;
        await this.persist();
        return true;
      }
      // ------------------------------------------------------------- patients
      async listPatients(query = {}) {
        const search = query.search?.trim().toLowerCase();
        let rows = [...this.db.patients];
        if (search) {
          rows = rows.filter(
            (p) => contains(p.fullName, search) || contains(p.phone, search) || phoneContains(p.phone, search) || contains(p.address, search)
          );
        }
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const total = rows.length;
        const offset = query.offset ?? 0;
        const limit = query.limit ?? total;
        return { items: rows.slice(offset, offset + limit), total };
      }
      async getPatient(id) {
        return this.db.patients.find((p) => p.id === id);
      }
      async getPatientByPhone(phone) {
        const digits = nationalPhoneDigits(phone);
        if (digits.length !== 9) return void 0;
        return [...this.db.patients].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((p) => nationalPhoneDigits(p.phone) === digits);
      }
      async getPatientByChatId(chatId) {
        return this.db.patients.find((p) => p.telegramChatId === chatId);
      }
      async createPatient(input) {
        const patient = {
          id: randomUUID(),
          fullName: input.fullName,
          phone: input.phone,
          address: input.address ?? null,
          age: input.age ?? null,
          gender: input.gender ?? null,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          telegramChatId: null,
          telegramLinkedAt: null
        };
        this.db.patients.push(patient);
        await this.persist();
        return patient;
      }
      async updatePatient(id, input) {
        const patient = this.db.patients.find((p) => p.id === id);
        if (!patient) return void 0;
        if (input.fullName !== void 0) patient.fullName = input.fullName;
        if (input.phone !== void 0) patient.phone = input.phone;
        if (input.address !== void 0) patient.address = input.address ?? null;
        if (input.age !== void 0) patient.age = input.age ?? null;
        if (input.gender !== void 0) patient.gender = input.gender ?? null;
        await this.persist();
        return patient;
      }
      async deletePatient(id) {
        if (this.db.orders.some((o) => o.patientId === id)) {
          throw new Error("Bu bemorda buyurtmalar mavjud \u2014 avval buyurtmalarni o'chiring");
        }
        const before = this.db.patients.length;
        this.db.patients = this.db.patients.filter((p) => p.id !== id);
        if (this.db.patients.length === before) return false;
        await this.persist();
        return true;
      }
      // ---------------------------------------------------------------- tests
      async listTests(opts = {}) {
        const rows = opts.activeOnly ? this.db.tests.filter((t) => t.isActive) : [...this.db.tests];
        return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      }
      async getTest(id) {
        return this.db.tests.find((t) => t.id === id);
      }
      async createTest(input) {
        const test = {
          id: randomUUID(),
          name: input.name,
          price: input.price,
          category: input.category,
          unit: input.unit ?? null,
          referenceRange: input.referenceRange ?? null,
          isActive: input.isActive ?? true
        };
        this.db.tests.push(test);
        await this.persist();
        return test;
      }
      async updateTest(id, input) {
        const test = this.db.tests.find((t) => t.id === id);
        if (!test) return void 0;
        if (input.name !== void 0) test.name = input.name;
        if (input.price !== void 0) test.price = input.price;
        if (input.category !== void 0) test.category = input.category;
        if (input.unit !== void 0) test.unit = input.unit ?? null;
        if (input.referenceRange !== void 0) test.referenceRange = input.referenceRange ?? null;
        if (input.isActive !== void 0) test.isActive = input.isActive;
        await this.persist();
        return test;
      }
      async deleteTest(id) {
        const before = this.db.tests.length;
        this.db.tests = this.db.tests.filter((t) => t.id !== id);
        if (this.db.tests.length === before) return false;
        await this.persist();
        return true;
      }
      // --------------------------------------------------------------- orders
      hydrate(order) {
        return {
          ...order,
          patient: this.db.patients.find((p) => p.id === order.patientId) ?? null,
          items: this.db.orderTests.filter((ot) => ot.orderId === order.id)
        };
      }
      async listOrders(query = {}) {
        const search = query.search?.trim().toLowerCase();
        let base = this.db.orders.map((o) => this.hydrate(o));
        if (query.patientId) base = base.filter((o) => o.patientId === query.patientId);
        if (query.from) base = base.filter((o) => localDay(o.createdAt) >= query.from);
        if (query.to) base = base.filter((o) => localDay(o.createdAt) <= query.to);
        if (search) {
          base = base.filter(
            (o) => contains(o.patient?.fullName, search) || contains(o.patient?.phone, search) || phoneContains(o.patient?.phone, search) || String(o.orderNumber).includes(search) || o.items.some((i) => contains(i.testName, search))
          );
        }
        const counts = { all: base.length, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        for (const o of base) counts[o.status] += 1;
        const live = base.filter((o) => o.status !== "cancelled");
        const results = {
          waiting: live.filter(isWaiting).length,
          ready: live.filter(isReady).length
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
          summary: { counts, results, totals: { sum, paid, debt: Math.max(0, sum - paid) } }
        };
      }
      async getOrder(id) {
        const order = this.db.orders.find((o) => o.id === id);
        return order ? this.hydrate(order) : void 0;
      }
      async createOrder(input) {
        if (!this.db.patients.some((p) => p.id === input.patientId)) {
          throw new Error("Bemor topilmadi");
        }
        const selected = input.testIds.map((id) => this.db.tests.find((t) => t.id === id)).filter((t) => Boolean(t));
        if (selected.length === 0) throw new Error("Tanlangan tahlillar topilmadi");
        const subtotal = selected.reduce((sum, t) => sum + t.price, 0);
        const discount = Math.min(input.discount, subtotal);
        const total = subtotal - discount;
        this.db.counters.orderNumber += 1;
        const order = {
          id: randomUUID(),
          orderNumber: this.db.counters.orderNumber,
          patientId: input.patientId,
          totalAmount: total,
          discount,
          paidAmount: Math.min(input.paidAmount, total),
          status: "pending",
          notes: input.notes ?? null,
          createdBy: input.createdBy ?? null,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          completedAt: null,
          telegramSentAt: null
        };
        this.db.orders.push(order);
        for (const t of selected) {
          const item = {
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
            completedAt: null
          };
          this.db.orderTests.push(item);
        }
        await this.persist();
        return this.hydrate(order);
      }
      async updateOrder(id, input) {
        const order = this.db.orders.find((o) => o.id === id);
        if (!order) return void 0;
        if (input.discount !== void 0) {
          const subtotal = this.db.orderTests.filter((i) => i.orderId === id).reduce((s, i) => s + i.price, 0);
          order.discount = Math.min(input.discount, subtotal);
          order.totalAmount = subtotal - order.discount;
        }
        if (input.paidAmount !== void 0) order.paidAmount = Math.min(input.paidAmount, order.totalAmount);
        if (input.notes !== void 0) order.notes = input.notes ?? null;
        if (input.status) {
          order.status = input.status;
          order.completedAt = input.status === "completed" ? (/* @__PURE__ */ new Date()).toISOString() : null;
        }
        await this.persist();
        return this.hydrate(order);
      }
      async saveResults(id, results) {
        const order = this.db.orders.find((o) => o.id === id);
        if (!order) return void 0;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        for (const incoming of results) {
          const item = this.db.orderTests.find((i) => i.id === incoming.id && i.orderId === id);
          if (!item) continue;
          const value = incoming.result?.trim() || null;
          item.result = value;
          item.flag = incoming.flag ?? null;
          item.notes = incoming.notes?.trim() || null;
          item.completedAt = value ? now : null;
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
        return this.hydrate(order);
      }
      async deleteOrder(id) {
        const before = this.db.orders.length;
        this.db.orders = this.db.orders.filter((o) => o.id !== id);
        if (this.db.orders.length === before) return false;
        this.db.orderTests = this.db.orderTests.filter((i) => i.orderId !== id);
        await this.persist();
        return true;
      }
      // ------------------------------------------------------------- telegram
      async linkTelegram(patientId, chatId) {
        const patient = this.db.patients.find((p) => p.id === patientId);
        if (!patient) return void 0;
        for (const other of this.db.patients) {
          if (other.id !== patientId && other.telegramChatId === chatId) {
            other.telegramChatId = null;
            other.telegramLinkedAt = null;
          }
        }
        patient.telegramChatId = chatId;
        patient.telegramLinkedAt = (/* @__PURE__ */ new Date()).toISOString();
        await this.persist();
        return patient;
      }
      async savePendingContact(input) {
        const row = {
          chatId: input.chatId,
          phone: input.phone,
          fullName: input.fullName ?? null,
          username: input.username ?? null,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.db.telegramContacts = this.db.telegramContacts.filter((c) => c.chatId !== input.chatId);
        this.db.telegramContacts.push(row);
        await this.persist();
      }
      async findPendingContact(phone) {
        const digits = nationalPhoneDigits(phone);
        if (digits.length !== 9) return void 0;
        return [...this.db.telegramContacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((c) => nationalPhoneDigits(c.phone) === digits);
      }
      async deletePendingContact(chatId) {
        const before = this.db.telegramContacts.length;
        this.db.telegramContacts = this.db.telegramContacts.filter((c) => c.chatId !== chatId);
        if (this.db.telegramContacts.length !== before) await this.persist();
      }
      async unlinkTelegram(chatId) {
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
      async listUndeliveredOrders(patientId, limit = 5) {
        return this.db.orders.filter((o) => o.patientId === patientId && o.status === "completed" && !o.telegramSentAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((o) => this.hydrate(o));
      }
      async markTelegramSent(orderId) {
        const order = this.db.orders.find((o) => o.id === orderId);
        if (!order) return;
        order.telegramSentAt = (/* @__PURE__ */ new Date()).toISOString();
        await this.persist();
      }
      // ------------------------------------------------------------ reporting
      async getDashboardStats() {
        const today = todayKey();
        const todayOrders = this.db.orders.filter(
          (o) => localDay(o.createdAt) === today && o.status !== "cancelled"
        );
        const activeOrderIds = new Set(
          this.db.orders.filter((o) => o.status !== "cancelled").map((o) => o.id)
        );
        const activeItems = this.db.orderTests.filter((i) => activeOrderIds.has(i.orderId));
        return {
          todayPatients: new Set(todayOrders.map((o) => o.patientId)).size,
          pendingTests: activeItems.filter((i) => !i.result).length,
          readyTests: activeItems.filter((i) => Boolean(i.result)).length,
          todayRevenue: todayOrders.reduce((sum, o) => sum + o.paidAmount, 0),
          totalPatients: this.db.patients.length,
          unpaidAmount: this.db.orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + Math.max(0, o.totalAmount - o.paidAmount), 0)
        };
      }
      async getRevenueReport(from, to) {
        const inRange = this.db.orders.filter((o) => {
          const day = localDay(o.createdAt);
          return day >= from && day <= to && o.status !== "cancelled";
        });
        const byDay = /* @__PURE__ */ new Map();
        for (const order of inRange) {
          const day = localDay(order.createdAt);
          const bucket = byDay.get(day) ?? { patients: /* @__PURE__ */ new Set(), tests: 0, revenue: 0 };
          bucket.patients.add(order.patientId);
          bucket.tests += this.db.orderTests.filter((i) => i.orderId === order.id).length;
          bucket.revenue += order.totalAmount;
          byDay.set(day, bucket);
        }
        const points = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, b]) => ({ date, patients: b.patients.size, tests: b.tests, revenue: b.revenue }));
        const orderIds = new Set(inRange.map((o) => o.id));
        const items = this.db.orderTests.filter((i) => orderIds.has(i.orderId));
        const testAgg = /* @__PURE__ */ new Map();
        const catAgg = /* @__PURE__ */ new Map();
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
        return {
          range: { from, to },
          points,
          totalRevenue: inRange.reduce((s, o) => s + o.totalAmount, 0),
          totalPaid: inRange.reduce((s, o) => s + o.paidAmount, 0),
          totalPatients: new Set(inRange.map((o) => o.patientId)).size,
          totalTests: items.length,
          topTests: Array.from(testAgg.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
          byCategory: Array.from(catAgg.entries()).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue)
        };
      }
      // ------------------------------------------------------------- settings
      async getSettings() {
        return this.db.settings;
      }
      async updateSettings(input) {
        this.db.settings = {
          ...this.db.settings,
          labName: input.labName,
          tagline: input.tagline,
          address: input.address ?? null,
          phone: input.phone ?? null,
          director: input.director ?? null,
          licenseNumber: input.licenseNumber ?? null
        };
        await this.persist();
        return this.db.settings;
      }
    };
  }
});

// server/env.ts
try {
  process.loadEnvFile(".env");
} catch {
}

// server/app.ts
import express from "express";

// server/routes.ts
init_schema();
import passport2 from "passport";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// server/auth.ts
init_password();
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

// server/storage.ts
init_storage_types();
var usingPostgres = Boolean(process.env.DATABASE_URL);
async function createStorage() {
  if (usingPostgres) {
    const { PgStorage: PgStorage2 } = await Promise.resolve().then(() => (init_storage_pg(), storage_pg_exports));
    return new PgStorage2();
  }
  const { FileStorage: FileStorage2 } = await Promise.resolve().then(() => (init_storage_file(), storage_file_exports));
  return new FileStorage2();
}
var storage = await createStorage();

// server/auth.ts
var MemoryStore = createMemoryStore(session);
var PgSession = connectPgSimple(session);
function createSessionStore() {
  if (!process.env.DATABASE_URL) {
    return new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1e3 });
  }
  return new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60
    // seconds
  });
}
function setupAuth(app) {
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "medlab-dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      store: createSessionStore(),
      // The session is only ended by an explicit logout, so the cookie is given
      // a year and `rolling` pushes that expiry forward on every request.
      rolling: true,
      cookie: {
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1e3,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      }
    })
  );
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !await verifyPassword(password, user.password)) {
          return done(null, false, { message: "Login yoki parol noto'g'ri" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "Hisob bloklangan. Administratorga murojaat qiling" });
        }
        const { password: _password, ...pub } = user;
        return done(null, pub);
      } catch (err) {
        return done(err);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user || !user.isActive) return done(null, false);
      const { password: _password, ...pub } = user;
      done(null, pub);
    } catch (err) {
      done(err);
    }
  });
  app.use(passport.initialize());
  app.use(passport.session());
}
function requireAuth(req, res, next) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ message: "Avval tizimga kiring" });
  }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ message: "Avval tizimga kiring" });
    }
    const role = req.user?.role;
    if (role !== "admin" && (!role || !roles.includes(role))) {
      return res.status(403).json({ message: "Bu amal uchun ruxsatingiz yo'q" });
    }
    next();
  };
}

// server/telegram.ts
init_schema();
import { Bot, GrammyError, Keyboard, webhookCallback } from "grammy";

// server/logger.ts
function log(message, source = "express") {
  const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${time} [${source}] ${message}`);
}

// server/telegram.ts
var token = process.env.TELEGRAM_BOT_TOKEN?.trim();
var telegramEnabled = Boolean(token);
var webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || void 0;
var MAX_MESSAGE = 3500;
var CONTACT_BUTTON = "\u{1F4F1} Telefon raqamimni yuborish";
var FLAG_MARKS = { low: "\u{1F53B}", high: "\u{1F53A}", normal: "\u2705" };
var contactKeyboard = () => new Keyboard().requestContact(CONTACT_BUTTON).resized().oneTime();
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function isOrderReady(order) {
  return order.items.length > 0 && order.items.every((i) => Boolean(i.result));
}
function buildResultMessage(order, settings) {
  const head = [
    `\u{1F9EA} <b>${escapeHtml(settings.labName)}</b> \u2014 tahlil natijasi`,
    "",
    `Hurmatli <b>${escapeHtml(order.patient?.fullName ?? "bemor")}</b>,`,
    `<b>#${order.orderNumber}</b> raqamli buyurtmangiz natijalari tayyor` + (order.completedAt ? ` (${formatDate(order.completedAt)}).` : "."),
    ""
  ].join("\n");
  const items = order.items.map((item) => {
    const mark = item.flag && FLAG_MARKS[item.flag] || "\u2022";
    const value = [item.result, item.unit].filter(Boolean).join(" ");
    let line = `${mark} <b>${escapeHtml(item.testName)}</b>: ${escapeHtml(value)}`;
    if (item.referenceRange) line += `
     <i>me'yor: ${escapeHtml(item.referenceRange)}</i>`;
    if (item.notes) line += `
     <i>${escapeHtml(item.notes)}</i>`;
    return line;
  });
  const foot = [
    "",
    "\u2139\uFE0F Natijalar tashxis o'rnini bosmaydi \u2014 shifokoringiz bilan maslahatlashing.",
    settings.phone ? `\u260E\uFE0F ${escapeHtml(settings.phone)}` : null,
    settings.address ? `\u{1F4CD} ${escapeHtml(settings.address)}` : null
  ].filter((l) => l !== null).join("\n");
  const chunks = [];
  let current = head;
  for (const line of [...items, foot]) {
    if (current.length + line.length + 1 > MAX_MESSAGE) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);
  return chunks;
}
var instance = null;
function getBot() {
  if (!instance) {
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
    instance = new Bot(token);
    registerHandlers(instance);
    instance.catch((err) => console.error("[telegram]", err.error));
  }
  return instance;
}
function registerHandlers(bot) {
  bot.command("start", async (ctx) => {
    const linked = await patientOfChat(ctx.chat.id);
    if (linked) {
      await ctx.reply(
        `Assalomu alaykum, <b>${escapeHtml(linked.fullName)}</b>! Siz allaqachon ulangansiz \u2014 tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.

/natijalarim \u2014 oxirgi natijalaringizni ko'rish
/stop \u2014 xabarnomalarni to'xtatish`,
        { parse_mode: "HTML" }
      );
      return;
    }
    await ctx.reply(
      "Assalomu alaykum! \u{1F44B}\n\nTahlil natijalaringizni shu yerdan olish uchun pastdagi tugma orqali telefon raqamingizni yuboring. Raqam laboratoriyada ro'yxatdan o'tgan raqam bilan bir xil bo'lishi kerak.",
      { reply_markup: contactKeyboard() }
    );
  });
  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply(
        "Iltimos, <b>o'zingizning</b> raqamingizni tugma orqali yuboring.",
        { parse_mode: "HTML", reply_markup: contactKeyboard() }
      );
      return;
    }
    const patient = await storage.getPatientByPhone(contact.phone_number);
    if (!patient) {
      await storage.savePendingContact({
        chatId: String(ctx.chat.id),
        phone: normalizeUzPhone(contact.phone_number),
        fullName: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        username: ctx.from.username ?? null
      });
      await ctx.reply(
        "Rahmat, raqamingiz qabul qilindi! \u2705\n\nHozircha bu raqam bo'yicha ro'yxatdan o'tmagansiz. Laboratoriyaga kelib ro'yxatdan o'tishingiz bilan shu chat avtomatik bog'lanadi va natijalaringiz shu yerga keladi.",
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    await storage.linkTelegram(patient.id, String(ctx.chat.id));
    await ctx.reply(
      `Rahmat, <b>${escapeHtml(patient.fullName)}</b>! \u2705

Bundan buyon tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.`,
      { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
    );
    const pending = await storage.listUndeliveredOrders(patient.id);
    for (const order of pending.reverse()) {
      await deliverOrderResults(order);
    }
  });
  bot.command("natijalarim", async (ctx) => {
    const patient = await patientOfChat(ctx.chat.id);
    if (!patient) {
      await ctx.reply("Avval telefon raqamingizni yuboring.", { reply_markup: contactKeyboard() });
      return;
    }
    const { items } = await storage.listOrders({ patientId: patient.id, status: "completed", limit: 3 });
    const ready = items.filter(isOrderReady);
    if (ready.length === 0) {
      await ctx.reply("Hozircha tayyor natijangiz yo'q. Tayyor bo'lishi bilan xabar beramiz. \u23F3");
      return;
    }
    const settings = await storage.getSettings();
    for (const order of ready.reverse()) {
      for (const chunk of buildResultMessage(order, settings)) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    }
  });
  bot.command("stop", async (ctx) => {
    await storage.deletePendingContact(String(ctx.chat.id));
    const removed = await storage.unlinkTelegram(String(ctx.chat.id));
    await ctx.reply(
      removed ? "Xabarnomalar to'xtatildi. Qayta ulanish uchun /start bosing." : "Siz ulanmagansiz. Ulanish uchun /start bosing.",
      { reply_markup: { remove_keyboard: true } }
    );
  });
  bot.on("message", async (ctx) => {
    const patient = await patientOfChat(ctx.chat.id);
    if (patient) {
      await ctx.reply(
        "Natijalaringiz tayyor bo'lishi bilan avtomatik yuboriladi.\n\n/natijalarim \u2014 oxirgi natijalar\n/stop \u2014 xabarnomalarni to'xtatish"
      );
      return;
    }
    await ctx.reply("Boshlash uchun telefon raqamingizni yuboring.", { reply_markup: contactKeyboard() });
  });
}
function patientOfChat(chatId) {
  return storage.getPatientByChatId(String(chatId));
}
function telegramWebhook() {
  const callback = webhookCallback(getBot(), "express", { secretToken: webhookSecret });
  return async (req, res) => {
    try {
      await callback(req, res);
    } catch (err) {
      console.error("[telegram] webhook", err);
      if (!res.headersSent) res.sendStatus(200);
    }
  };
}
async function claimPendingContact(patient) {
  if (!telegramEnabled || patient.telegramChatId) return patient;
  let linked = patient;
  try {
    const pending = await storage.findPendingContact(patient.phone);
    if (!pending) return patient;
    linked = await storage.linkTelegram(patient.id, pending.chatId) ?? patient;
    await storage.deletePendingContact(pending.chatId);
    const settings = await storage.getSettings();
    await getBot().api.sendMessage(
      pending.chatId,
      `Assalomu alaykum, <b>${escapeHtml(linked.fullName)}</b>! \u2705

${escapeHtml(settings.labName)} tizimida ro'yxatdan o'tdingiz. Tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.`,
      { parse_mode: "HTML" }
    );
    for (const order of (await storage.listUndeliveredOrders(linked.id)).reverse()) {
      await deliverOrderResults(order);
    }
  } catch (err) {
    console.error("[telegram] claim", err);
  }
  return linked;
}
async function telegramPhoneStatus(phone) {
  if (!telegramEnabled) return { connected: false, source: null, telegramName: null };
  const patient = await storage.getPatientByPhone(phone);
  if (patient?.telegramChatId) return { connected: true, source: "patient", telegramName: null };
  const pending = await storage.findPendingContact(phone);
  if (pending) return { connected: true, source: "pending", telegramName: pending.fullName };
  return { connected: false, source: null, telegramName: null };
}
async function deliverOrderResults(order, opts = {}) {
  if (!telegramEnabled) return { sent: false, reason: "Telegram bot sozlanmagan" };
  if (order.status === "cancelled") return { sent: false, reason: "Buyurtma bekor qilingan" };
  if (!isOrderReady(order)) return { sent: false, reason: "Natijalar to'liq emas" };
  const chatId = order.patient?.telegramChatId;
  if (!chatId) return { sent: false, reason: "Bemor Telegram botga ulanmagan" };
  if (order.telegramSentAt && !opts.force) return { sent: false, reason: "Allaqachon yuborilgan" };
  const settings = await storage.getSettings();
  try {
    for (const chunk of buildResultMessage(order, settings)) {
      await getBot().api.sendMessage(chatId, chunk, { parse_mode: "HTML" });
    }
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 403) {
      await storage.unlinkTelegram(chatId);
      return { sent: false, reason: "Bemor botni bloklagan" };
    }
    const reason = err instanceof Error ? err.message : "Telegramga yuborilmadi";
    console.error("[telegram] send", err);
    return { sent: false, reason };
  }
  await storage.markTelegramSent(order.id);
  log(`[telegram] #${order.orderNumber} natijasi yuborildi`);
  return { sent: true };
}
async function notifyIfReady(order) {
  if (!telegramEnabled) return { sent: false, reason: "Telegram bot sozlanmagan" };
  try {
    return await deliverOrderResults(order);
  } catch (err) {
    console.error("[telegram] notify", err);
    return { sent: false, reason: err instanceof Error ? err.message : "Xatolik" };
  }
}
var cachedMe = null;
async function telegramBotInfo() {
  if (!telegramEnabled) return null;
  if (cachedMe) return cachedMe;
  try {
    const me = await getBot().api.getMe();
    cachedMe = { id: me.id, username: me.username };
    return cachedMe;
  } catch (err) {
    console.error("[telegram] getMe", err);
    return null;
  }
}

// server/routes.ts
var handle = (fn) => (req, res, next) => fn(req, res).catch(next);
var numberParam = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
async function registerRoutes(app) {
  setupAuth(app);
  console.log(`[db] ${usingPostgres ? "Postgres (Neon)" : "Mahalliy JSON (.data/db.json)"}`);
  const seeded = await storage.seed();
  if (seeded.createdTests) {
    console.log(`[seed] ${seeded.createdTests} ta tahlil narxlar ro'yxatiga yuklandi`);
  }
  if (seeded.createdUsers) {
    console.log("[seed] Standart foydalanuvchilar yaratildi \u2014 admin / admin123");
  }
  if (telegramEnabled) {
    app.post("/api/telegram/webhook", telegramWebhook());
    console.log("[telegram] webhook yo'li: POST /api/telegram/webhook");
  } else {
    console.log("[telegram] TELEGRAM_BOT_TOKEN yo'q \u2014 bot o'chirilgan");
  }
  app.get(
    "/api/telegram/status",
    requireAuth,
    handle(async (_req, res) => {
      const info = await telegramBotInfo();
      res.json({ enabled: telegramEnabled, username: info?.username ?? null });
    })
  );
  app.get(
    "/api/telegram/phone",
    requireAuth,
    handle(async (req, res) => {
      const phone = typeof req.query.phone === "string" ? req.query.phone : "";
      res.json(await telegramPhoneStatus(phone));
    })
  );
  app.post("/api/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromZodError(parsed.error).toString() });
    }
    passport2.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message ?? "Login yoki parol noto'g'ri" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json(user);
      });
    })(req, res, next);
  });
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => res.sendStatus(204));
    });
  });
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ message: "Avval tizimga kiring" });
    res.json(req.user);
  });
  app.get(
    "/api/patients",
    requireAuth,
    handle(async (req, res) => {
      const result = await storage.listPatients({
        search: typeof req.query.search === "string" ? req.query.search : void 0,
        limit: numberParam(req.query.limit),
        offset: numberParam(req.query.offset, 0)
      });
      res.json(result);
    })
  );
  app.get(
    "/api/patients/:id",
    requireAuth,
    handle(async (req, res) => {
      const patient = await storage.getPatient(req.params.id);
      if (!patient) return res.status(404).json({ message: "Bemor topilmadi" });
      res.json(patient);
    })
  );
  app.get(
    "/api/patients/:id/orders",
    requireAuth,
    handle(async (req, res) => {
      const result = await storage.listOrders({ patientId: req.params.id });
      res.json(result);
    })
  );
  app.post(
    "/api/patients",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = insertPatientSchema.parse(req.body);
      const patient = await storage.createPatient(input);
      res.status(201).json(await claimPendingContact(patient));
    })
  );
  app.patch(
    "/api/patients/:id",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = insertPatientSchema.partial().parse(req.body);
      const patient = await storage.updatePatient(req.params.id, input);
      if (!patient) return res.status(404).json({ message: "Bemor topilmadi" });
      res.json(await claimPendingContact(patient));
    })
  );
  app.delete(
    "/api/patients/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const ok = await storage.deletePatient(req.params.id);
      if (!ok) return res.status(404).json({ message: "Bemor topilmadi" });
      res.sendStatus(204);
    })
  );
  app.get(
    "/api/tests",
    requireAuth,
    handle(async (req, res) => {
      res.json(await storage.listTests({ activeOnly: req.query.all !== "1" }));
    })
  );
  app.post(
    "/api/tests",
    requireRole("admin"),
    handle(async (req, res) => {
      res.status(201).json(await storage.createTest(insertTestSchema.parse(req.body)));
    })
  );
  app.patch(
    "/api/tests/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const test = await storage.updateTest(req.params.id, insertTestSchema.partial().parse(req.body));
      if (!test) return res.status(404).json({ message: "Tahlil topilmadi" });
      res.json(test);
    })
  );
  app.delete(
    "/api/tests/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const ok = await storage.deleteTest(req.params.id);
      if (!ok) return res.status(404).json({ message: "Tahlil topilmadi" });
      res.sendStatus(204);
    })
  );
  app.get(
    "/api/orders",
    requireAuth,
    handle(async (req, res) => {
      const statusParam = req.query.status;
      const status = ORDER_STATUSES.find((s) => s === statusParam);
      const queueParam = req.query.queue;
      const queue2 = queueParam === "waiting" || queueParam === "ready" ? queueParam : void 0;
      const result = await storage.listOrders({
        search: typeof req.query.search === "string" ? req.query.search : void 0,
        status,
        queue: queue2,
        patientId: typeof req.query.patientId === "string" ? req.query.patientId : void 0,
        from: typeof req.query.from === "string" ? req.query.from : void 0,
        to: typeof req.query.to === "string" ? req.query.to : void 0,
        limit: numberParam(req.query.limit),
        offset: numberParam(req.query.offset, 0)
      });
      res.json(result);
    })
  );
  app.get(
    "/api/orders/:id",
    requireAuth,
    handle(async (req, res) => {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      res.json(order);
    })
  );
  app.post(
    "/api/orders",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = createOrderSchema.parse(req.body);
      const order = await storage.createOrder({ ...input, createdBy: req.user?.id ?? null });
      res.status(201).json(order);
    })
  );
  app.patch(
    "/api/orders/:id",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const order = await storage.updateOrder(req.params.id, updateOrderSchema.parse(req.body));
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      if (order.status === "completed") await notifyIfReady(order);
      res.json(order);
    })
  );
  app.post(
    "/api/orders/:id/results",
    requireRole("laborant"),
    handle(async (req, res) => {
      const { results } = saveResultsSchema.parse(req.body);
      const order = await storage.saveResults(req.params.id, results);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      const delivery = await notifyIfReady(order);
      res.json({ ...order, telegram: delivery });
    })
  );
  app.post(
    "/api/orders/:id/telegram",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      const result = await deliverOrderResults(order, { force: true });
      if (!result.sent) return res.status(400).json({ message: result.reason ?? "Yuborilmadi" });
      res.json({ ...await storage.getOrder(req.params.id), telegram: result });
    })
  );
  app.delete(
    "/api/orders/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const ok = await storage.deleteOrder(req.params.id);
      if (!ok) return res.status(404).json({ message: "Buyurtma topilmadi" });
      res.sendStatus(204);
    })
  );
  app.get(
    "/api/stats",
    requireAuth,
    handle(async (_req, res) => {
      res.json(await storage.getDashboardStats());
    })
  );
  app.get(
    "/api/reports/revenue",
    requireRole("admin"),
    handle(async (req, res) => {
      const today = localDay(/* @__PURE__ */ new Date());
      const defaultFrom = /* @__PURE__ */ new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 29);
      const from = typeof req.query.from === "string" ? req.query.from : localDay(defaultFrom);
      const to = typeof req.query.to === "string" ? req.query.to : today;
      res.json(await storage.getRevenueReport(from, to));
    })
  );
  app.get(
    "/api/settings",
    requireAuth,
    handle(async (_req, res) => {
      res.json(await storage.getSettings());
    })
  );
  app.put(
    "/api/settings",
    requireRole("admin"),
    handle(async (req, res) => {
      res.json(await storage.updateSettings(labSettingsSchema.parse(req.body)));
    })
  );
  app.get(
    "/api/users",
    requireRole("admin"),
    handle(async (_req, res) => {
      res.json(await storage.listUsers());
    })
  );
  app.post(
    "/api/users",
    requireRole("admin"),
    handle(async (req, res) => {
      const input = insertUserSchema.parse(req.body);
      if (await storage.getUserByUsername(input.username)) {
        return res.status(409).json({ message: "Bu login allaqachon band" });
      }
      res.status(201).json(await storage.createUser(input));
    })
  );
  app.patch(
    "/api/users/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const input = updateUserSchema.parse(req.body);
      if (input.username) {
        const existing = await storage.getUserByUsername(input.username);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: "Bu login allaqachon band" });
        }
      }
      const user = await storage.updateUser(req.params.id, input);
      if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      res.json(user);
    })
  );
  app.delete(
    "/api/users/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      if (req.params.id === req.user?.id) {
        return res.status(400).json({ message: "O'z hisobingizni o'chira olmaysiz" });
      }
      const ok = await storage.deleteUser(req.params.id);
      if (!ok) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      res.sendStatus(204);
    })
  );
  app.use("/api", (err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ZodError) {
      return res.status(400).json({ message: fromZodError(err).toString() });
    }
    if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  });
}

// server/app.ts
async function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${Date.now() - start}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 120) logLine = logLine.slice(0, 119) + "\u2026";
      log(logLine);
    });
    next();
  });
  await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
    const message = err instanceof Error ? err.message : "Ichki xatolik";
    console.error("[error]", err);
    if (!res.headersSent) res.status(status || 500).json({ message });
  });
  return app;
}

// server/serverless.ts
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
var appPromise = createApp();
function restoreOriginalUrl(req) {
  if (!req.url) return;
  const url = new URL(req.url, "http://localhost");
  const original = url.searchParams.get("__path");
  if (!original) return;
  url.searchParams.delete("__path");
  const query = url.searchParams.toString();
  req.url = query ? `${original}?${query}` : original;
}
async function handler(req, res) {
  restoreOriginalUrl(req);
  const app = await appPromise;
  app(req, res);
}
export {
  handler as default
};
