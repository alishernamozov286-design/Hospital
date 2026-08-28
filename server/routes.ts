import type { Express, NextFunction, Request, Response } from "express";
import passport from "passport";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  SAMPLE_STATUS_LABELS,
  changePasswordSchema,
  createOrderSchema,
  createPaymentSchema,
  insertExpenseSchema,
  insertPatientSchema,
  insertTestSchema,
  insertUserSchema,
  labSettingsSchema,
  loginSchema,
  nationalPhoneDigits,
  saveResultsSchema,
  updateOrderSchema,
  updateSampleSchema,
  updateUserSchema,
  type PublicUser,
} from "@shared/schema";
import {
  ATTEMPTS_BEFORE_LOCK,
  attemptsLeftMessage,
  formatLockRemaining,
  isFinalLock,
  lockMessage,
  lockRemainingMs,
  registerFailure,
  registerSuccess,
} from "@shared/lockout";
import {
  clearFailedLogins,
  loginRateLimit,
  recordFailedLogin,
  requireAuth,
  requireRole,
  setupAuth,
} from "./auth";
import { csvHeaders, stamp, toCsv } from "./csv";
import { verifyPassword } from "./password";
import { localDay, storage, usingPostgres } from "./storage";
import type { Actor } from "./storage-types";
import {
  claimPendingContact,
  deliverOrderResults,
  notifyIfReady,
  telegramBotInfo,
  telegramEnabled,
  telegramPhoneStatus,
  telegramUsesWebhook,
  telegramWebhook,
} from "./telegram";

/** Wraps an async handler so a rejected promise reaches the error middleware. */
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const numberParam = (value: unknown, fallback?: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const stringParam = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/** Who is doing this, in the shape the storage layer stamps onto rows. */
function actorOf(req: Request): Actor {
  return { id: req.user?.id ?? null, name: req.user?.fullName ?? "Tizim" };
}

/**
 * Appends to the audit log.
 *
 * Never rejects: the log is a record of the work, not part of it, so a logging
 * failure must not roll back a payment the cashier already took. Failures go to
 * the server console where they can be noticed.
 */
async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
): Promise<void> {
  try {
    await storage.writeAudit({ actor: actorOf(req), action, entity, entityId, summary });
  } catch (err) {
    console.error("[audit] yozib bo'lmadi:", err);
  }
}

export async function registerRoutes(app: Express): Promise<void> {
  setupAuth(app);
  console.log(`[db] ${usingPostgres ? "Postgres (Neon)" : "Mahalliy JSON (.data/db.json)"}`);
  const seeded = await storage.seed();
  if (seeded.createdTests) {
    console.log(`[seed] ${seeded.createdTests} ta tahlil narxlar ro'yxatiga yuklandi`);
  }
  if (seeded.createdUsers) {
    console.log("[seed] Standart foydalanuvchilar yaratildi — admin / admin123");
  }

  // -------------------------------------------------------------- telegram

  // Registered before everything else and without auth: the caller is Telegram,
  // not a signed-in user. Requests are authenticated by the bot token in the
  // URL path being unguessable plus, when set, TELEGRAM_WEBHOOK_SECRET.
  // Registering the route is what commits this bot to webhook mode, so it only
  // happens on the deployment that actually receives them; index.ts polls
  // instead. Creating both on one bot is an error grammY refuses outright.
  if (telegramEnabled && telegramUsesWebhook) {
    app.post("/api/telegram/webhook", telegramWebhook());
    console.log("[telegram] webhook yo'li: POST /api/telegram/webhook");
  } else if (!telegramEnabled) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN yo'q — bot o'chirilgan");
  }

  app.get(
    "/api/telegram/status",
    requireAuth,
    handle(async (_req, res) => {
      const info = await telegramBotInfo();
      res.json({ enabled: telegramEnabled, username: info?.username ?? null });
    }),
  );

  /** "Has this number opened the bot?" — shown live in the registration form. */
  app.get(
    "/api/telegram/phone",
    requireAuth,
    handle(async (req, res) => {
      const phone = typeof req.query.phone === "string" ? req.query.phone : "";
      res.json(await telegramPhoneStatus(phone));
    }),
  );

  // ------------------------------------------------------------------ auth

  /**
   * Signing in, with the escalating account lockout in front of it.
   *
   * The lock is enforced here and nowhere else. An account that locks while
   * one of its sessions is open keeps that session: the point is to stop
   * someone guessing their way in, not to throw the registrar off the counter
   * halfway through a shift. requireAuth therefore never consults it.
   */
  app.post("/api/login", loginRateLimit, (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: fromZodError(parsed.error).toString() });
    }

    handle(async (request, response) => {
      const account = await storage.getUserByUsername(parsed.data.username);

      // Locked accounts are turned away before the password is even checked,
      // so a correct guess during a lock reveals nothing and resets nothing.
      if (account) {
        const remaining = lockRemainingMs(account.lockedUntil);
        if (remaining > 0) {
          return response.status(423).json({
            message: lockMessage(remaining, isFinalLock(account)),
            lockedUntil: account.lockedUntil,
          });
        }
      }

      passport.authenticate(
        "local",
        async (err: Error | null, user: PublicUser | false, info?: { message?: string }) => {
          if (err) return next(err);

          if (!user) {
            recordFailedLogin(request);

            // No account by that name: answer exactly as for a wrong password,
            // so the form cannot be used to find out who works here.
            if (!account) {
              return response
                .status(401)
                .json({ message: info?.message ?? "Login yoki parol noto'g'ri" });
            }

            // A disabled account fails authentication too; counting that as a
            // password guess would lock a row an admin deliberately parked.
            if (!account.isActive) {
              return response
                .status(401)
                .json({ message: info?.message ?? "Login yoki parol noto'g'ri" });
            }

            const decision = registerFailure(account);
            await storage.setLockState(account.id, decision);

            if (decision.justLocked) {
              await audit(
                request,
                "login",
                "auth",
                account.id,
                `${account.fullName} hisobi qulflandi (${formatLockRemaining(decision.lockedForMs ?? 0)})`,
              );
              return response.status(423).json({
                message: lockMessage(decision.lockedForMs ?? 0, isFinalLock(decision)),
                lockedUntil: decision.lockedUntil,
              });
            }

            // Past the first lock a single mistake re-locks, so there is only
            // ever one attempt left however the count reads.
            const left =
              decision.lockLevel > 0 ? 1 : ATTEMPTS_BEFORE_LOCK - decision.failedAttempts;
            return response.status(401).json({
              message: info?.message ?? "Login yoki parol noto'g'ri",
              warning: attemptsLeftMessage(left, decision.lockLevel),
              attemptsLeft: left,
            });
          }

          request.logIn(user, async (loginErr) => {
            if (loginErr) return next(loginErr);
            clearFailedLogins(request);
            // Getting in clears the escalation: the account is demonstrably
            // theirs, so a previous bad run should not shorten the next one.
            if (account && (account.failedAttempts > 0 || account.lockLevel > 0)) {
              await storage.setLockState(account.id, registerSuccess());
            }
            void audit(request, "login", "auth", user.id, `${user.fullName} tizimga kirdi`);
            response.json(user);
          });
        },
      )(request, response, next);
    })(req, res, next);
  });

  /**
   * Self-service password change. Deliberately separate from the admin's
   * /api/users/:id: this one is available to every signed-in user, only ever
   * touches their own row, and requires the current password — so a walk-up to
   * an unlocked screen cannot lock the owner out of their own account.
   */
  app.post(
    "/api/user/password",
    requireAuth,
    handle(async (req, res) => {
      const input = changePasswordSchema.parse(req.body);
      const me = req.user!;

      const full = await storage.getUser(me.id);
      if (!full) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      if (!(await verifyPassword(input.currentPassword, full.password))) {
        return res.status(400).json({ message: "Joriy parol noto'g'ri" });
      }

      await storage.updateUser(me.id, { password: input.newPassword });
      await audit(req, "update", "user", me.id, `${me.fullName} parolini o'zgartirdi`);
      res.sendStatus(204);
    }),
  );

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

  // -------------------------------------------------------------- patients

  app.get(
    "/api/patients",
    requireAuth,
    handle(async (req, res) => {
      const result = await storage.listPatients({
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        limit: numberParam(req.query.limit),
        offset: numberParam(req.query.offset, 0),
      });
      res.json(result);
    }),
  );

  app.get(
    "/api/patients/:id",
    requireAuth,
    handle(async (req, res) => {
      const patient = await storage.getPatient(req.params.id);
      if (!patient) return res.status(404).json({ message: "Bemor topilmadi" });
      res.json(patient);
    }),
  );

  /** A patient's full visit history — the "was he here before?" question. */
  app.get(
    "/api/patients/:id/orders",
    requireAuth,
    handle(async (req, res) => {
      const result = await storage.listOrders({ patientId: req.params.id });
      res.json(result);
    }),
  );

  app.post(
    "/api/patients",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = insertPatientSchema.parse(req.body);
      const patient = await storage.createPatient(input);
      await audit(req, "create", "patient", patient.id, `№${patient.patientNumber} ${patient.fullName}`);
      // If they opened the bot before their first visit, bind that chat now.
      res.status(201).json(await claimPendingContact(patient));
    }),
  );

  app.patch(
    "/api/patients/:id",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = insertPatientSchema.partial().parse(req.body);
      const patient = await storage.updatePatient(req.params.id, input);
      if (!patient) return res.status(404).json({ message: "Bemor topilmadi" });
      await audit(req, "update", "patient", patient.id, `№${patient.patientNumber} ${patient.fullName} tahrirlandi`);
      // A corrected phone number can match a chat that was waiting all along.
      res.json(await claimPendingContact(patient));
    }),
  );

  app.delete(
    "/api/patients/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const before = await storage.getPatient(req.params.id);
      const ok = await storage.deletePatient(req.params.id);
      if (!ok) return res.status(404).json({ message: "Bemor topilmadi" });
      await audit(req, "delete", "patient", req.params.id, `${before?.fullName ?? "Bemor"} o'chirildi`);
      res.sendStatus(204);
    }),
  );

  // ----------------------------------------------------------------- tests

  app.get(
    "/api/tests",
    requireAuth,
    handle(async (req, res) => {
      res.json(await storage.listTests({ activeOnly: req.query.all !== "1" }));
    }),
  );

  app.post(
    "/api/tests",
    requireRole("admin"),
    handle(async (req, res) => {
      const test = await storage.createTest(insertTestSchema.parse(req.body));
      await audit(req, "create", "test", test.id, `"${test.name}" qo'shildi — ${test.price} so'm`);
      res.status(201).json(test);
    }),
  );

  app.patch(
    "/api/tests/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const input = insertTestSchema.partial().parse(req.body);
      const before = await storage.getTest(req.params.id);
      const test = await storage.updateTest(req.params.id, input);
      if (!test) return res.status(404).json({ message: "Tahlil topilmadi" });
      // A price change is the one edit worth spelling out — it silently
      // rewrites what every future order costs.
      const priceMoved = before && before.price !== test.price;
      await audit(
        req,
        "update",
        "test",
        test.id,
        priceMoved
          ? `"${test.name}" narxi ${before!.price} → ${test.price} so'm`
          : `"${test.name}" tahrirlandi`,
      );
      res.json(test);
    }),
  );

  app.delete(
    "/api/tests/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const before = await storage.getTest(req.params.id);
      const ok = await storage.deleteTest(req.params.id);
      if (!ok) return res.status(404).json({ message: "Tahlil topilmadi" });
      await audit(req, "delete", "test", req.params.id, `"${before?.name ?? "Tahlil"}" o'chirildi`);
      res.sendStatus(204);
    }),
  );

  // ---------------------------------------------------------------- orders

  app.get(
    "/api/orders",
    requireAuth,
    handle(async (req, res) => {
      const statusParam = req.query.status;
      const status = ORDER_STATUSES.find((s) => s === statusParam);
      const queueParam = req.query.queue;
      const queue = queueParam === "waiting" || queueParam === "ready" ? queueParam : undefined;
      const result = await storage.listOrders({
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        status,
        queue,
        patientId: typeof req.query.patientId === "string" ? req.query.patientId : undefined,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        limit: numberParam(req.query.limit),
        offset: numberParam(req.query.offset, 0),
      });
      res.json(result);
    }),
  );

  app.get(
    "/api/orders/:id",
    requireAuth,
    handle(async (req, res) => {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      res.json(order);
    }),
  );

  app.post(
    "/api/orders",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = createOrderSchema.parse(req.body);
      const order = await storage.createOrder({ ...input, createdBy: req.user?.id ?? null });
      await audit(
        req,
        "create",
        "order",
        order.id,
        `#${order.orderNumber} buyurtma yaratildi — ${order.items.length} ta tahlil`,
      );
      res.status(201).json(order);
    }),
  );

  app.patch(
    "/api/orders/:id",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const input = updateOrderSchema.parse(req.body);
      const before = await storage.getOrder(req.params.id);
      if (!before) return res.status(404).json({ message: "Buyurtma topilmadi" });

      const order = await storage.updateOrder(req.params.id, input);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });

      // Spelled out rather than "order updated": the log is only worth keeping
      // if it says what actually changed.
      const changes: string[] = [];
      if (input.testIds && before.items.length !== order.items.length) {
        changes.push(`tahlillar ${before.items.length} → ${order.items.length} ta`);
      }
      if (input.discount !== undefined && before.discount !== order.discount) {
        changes.push(`chegirma ${before.discount} → ${order.discount}`);
      }
      if (input.status && before.status !== order.status) {
        changes.push(`holat ${before.status} → ${order.status}`);
      }
      if (input.referrer !== undefined && (before.referrer ?? "") !== (order.referrer ?? "")) {
        changes.push(`yo'naltirgan: ${order.referrer || "—"}`);
      }
      if (changes.length) {
        await audit(req, "update", "order", order.id, `#${order.orderNumber}: ${changes.join(", ")}`);
      }

      // Marking an order completed by hand delivers it too, not just the
      // results screen.
      if (order.status === "completed") await notifyIfReady(order);
      res.json(order);
    }),
  );

  app.post(
    "/api/orders/:id/results",
    requireRole("laborant"),
    handle(async (req, res) => {
      const { results } = saveResultsSchema.parse(req.body);
      const order = await storage.saveResults(req.params.id, results, actorOf(req));
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      await audit(
        req,
        "results",
        "order",
        order.id,
        `#${order.orderNumber}: ${results.length} ta natija saqlandi`,
      );
      // Awaited on purpose: a serverless instance is frozen the moment the
      // response is flushed, so a detached send would never leave the machine.
      // notifyIfReady swallows its own errors, so saving results cannot fail
      // because Telegram is down.
      const delivery = await notifyIfReady(order);
      res.json({ ...order, telegram: delivery });
    }),
  );

  /** Manual (re)send from the order card — for a fixed result or a late link. */
  app.post(
    "/api/orders/:id/telegram",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      const result = await deliverOrderResults(order, { force: true });
      if (!result.sent) return res.status(400).json({ message: result.reason ?? "Yuborilmadi" });
      res.json({ ...(await storage.getOrder(req.params.id))!, telegram: result });
    }),
  );

  // ---------------------------------------------------------- result links

  /**
   * Mints (or returns) the token behind the QR code on a printed blank.
   *
   * Staff-only and idempotent: the print dialog calls it every time it opens,
   * and a reprint has to carry the same code as the sheet already in the
   * patient's hands.
   */
  /**
   * Moves the order's tube along its chain of custody.
   *
   * Open to both counter roles: the registrar draws the tube and the laborant
   * accepts or refuses it, and which of them is doing which step is recorded
   * on the row rather than enforced by the route — a small lab has one person
   * doing both, and a permission wall there would only teach them to share a
   * login.
   */
  app.patch(
    "/api/orders/:id/sample",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const input = updateSampleSchema.parse(req.body);
      const result = await storage.updateSampleStatus(req.params.id, input, actorOf(req));

      if (!result) return res.status(404).json({ message: "Namuna topilmadi" });
      // A refused transition is a conflict, not a bad request: the body was
      // well-formed, the tube had simply moved on since the page was loaded.
      if ("error" in result) return res.status(409).json({ message: result.error });

      const { sample, order } = result;
      const detail =
        input.status === "rad_etildi" ? `rad etildi — ${sample.rejectReason}` : SAMPLE_STATUS_LABELS[sample.status];
      await audit(req, "sample", "order", order.id, `#${order.orderNumber} namuna: ${detail}`);

      res.json(order);
    }),
  );

  /**
   * Resolves a scanned barcode to its order.
   *
   * A miss is a 404 with no detail — the scan box is behind a login, but there
   * is still no reason for it to confirm which numbers exist.
   */
  app.get(
    "/api/samples/scan",
    requireRole("registrator", "laborant"),
    handle(async (req, res) => {
      const code = String(req.query.code ?? "");
      const order = await storage.getOrderByBarcode(code);
      if (!order) return res.status(404).json({ message: "Bunday barcode topilmadi" });
      res.json(order);
    }),
  );

  app.delete(
    "/api/orders/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      // Read before deleting: afterwards there is no order number left to log.
      const before = await storage.getOrder(req.params.id);
      const ok = await storage.deleteOrder(req.params.id);
      if (!ok) return res.status(404).json({ message: "Buyurtma topilmadi" });
      await audit(
        req,
        "delete",
        "order",
        req.params.id,
        `#${before?.orderNumber ?? "?"} buyurtma o'chirildi (${before?.patient?.fullName ?? "—"})`,
      );
      res.sendStatus(204);
    }),
  );

  // -------------------------------------------------------------- payments

  app.post(
    "/api/orders/:id/payments",
    requireRole("registrator"),
    handle(async (req, res) => {
      const input = createPaymentSchema.parse(req.body);
      const order = await storage.addPayment(req.params.id, input, actorOf(req));
      if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
      const latest = order.payments?.[0];
      await audit(
        req,
        latest && latest.amount < 0 ? "refund" : "payment",
        "order",
        order.id,
        `#${order.orderNumber}: ${latest?.amount ?? input.amount} so'm (${input.method})`,
      );
      res.status(201).json(order);
    }),
  );

  app.delete(
    "/api/payments/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const ok = await storage.deletePayment(req.params.id);
      if (!ok) return res.status(404).json({ message: "To'lov topilmadi" });
      await audit(req, "delete", "payment", req.params.id, "To'lov yozuvi o'chirildi");
      res.sendStatus(204);
    }),
  );

  // -------------------------------------------------------------- expenses

  app.get(
    "/api/expenses",
    requireRole("admin"),
    handle(async (req, res) => {
      res.json(
        await storage.listExpenses({
          from: stringParam(req.query.from),
          to: stringParam(req.query.to),
          limit: numberParam(req.query.limit),
          offset: numberParam(req.query.offset, 0),
        }),
      );
    }),
  );

  app.post(
    "/api/expenses",
    requireRole("admin"),
    handle(async (req, res) => {
      const input = insertExpenseSchema.parse(req.body);
      const row = await storage.createExpense(input, actorOf(req));
      await audit(req, "create", "expense", row.id, `${row.category}: ${row.amount} so'm`);
      res.status(201).json(row);
    }),
  );

  app.delete(
    "/api/expenses/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      const ok = await storage.deleteExpense(req.params.id);
      if (!ok) return res.status(404).json({ message: "Xarajat topilmadi" });
      await audit(req, "delete", "expense", req.params.id, "Xarajat o'chirildi");
      res.sendStatus(204);
    }),
  );

  // ----------------------------------------------------------------- audit

  app.get(
    "/api/audit",
    requireRole("admin"),
    handle(async (req, res) => {
      res.json(
        await storage.listAudit({
          entity: stringParam(req.query.entity),
          limit: numberParam(req.query.limit, 50),
          offset: numberParam(req.query.offset, 0),
        }),
      );
    }),
  );

  // ----------------------------------------------------------------- export

  /**
   * Server-side so the file covers the whole dataset, not the page the user
   * happens to be looking at — the reason to export at all is usually to hand
   * the *complete* list to an accountant.
   */
  app.get(
    "/api/export/patients.csv",
    requireRole("admin"),
    handle(async (req, res) => {
      const { items } = await storage.listPatients({ search: stringParam(req.query.search) });
      csvHeaders(res, `bemorlar-${stamp()}.csv`);
      res.send(
        toCsv(
          ["№", "F.I.Sh", "Telefon", "Yosh", "Jinsi", "Manzil", "Telegram", "Ro'yxatdan o'tgan"],
          items.map((p) => [
            p.patientNumber,
            p.fullName,
            p.phone,
            p.age ?? "",
            p.gender ?? "",
            p.address ?? "",
            p.telegramChatId ? "ha" : "yo'q",
            localDay(p.createdAt),
          ]),
        ),
      );
    }),
  );

  app.get(
    "/api/export/orders.csv",
    requireRole("admin"),
    handle(async (req, res) => {
      const { items } = await storage.listOrders({
        from: stringParam(req.query.from),
        to: stringParam(req.query.to),
        search: stringParam(req.query.search),
      });
      csvHeaders(res, `buyurtmalar-${stamp()}.csv`);
      res.send(
        toCsv(
          [
            "Buyurtma №",
            "Sana",
            "Bemor №",
            "Bemor",
            "Telefon",
            "Tahlillar",
            "Tahlil soni",
            "Jami",
            "Chegirma",
            "To'langan",
            "Qarz",
            "Holat",
            "Yo'naltirgan",
          ],
          items.map((o) => [
            o.orderNumber,
            localDay(o.createdAt),
            o.patient?.patientNumber ?? "",
            o.patient?.fullName ?? "",
            o.patient?.phone ?? "",
            o.items.map((i) => i.testName).join("; "),
            o.items.length,
            o.totalAmount,
            o.discount,
            o.paidAmount,
            Math.max(0, o.totalAmount - o.paidAmount),
            ORDER_STATUS_LABELS[o.status],
            o.referrer ?? "",
          ]),
        ),
      );
    }),
  );

  app.get(
    "/api/export/expenses.csv",
    requireRole("admin"),
    handle(async (req, res) => {
      const { items } = await storage.listExpenses({
        from: stringParam(req.query.from),
        to: stringParam(req.query.to),
      });
      csvHeaders(res, `xarajatlar-${stamp()}.csv`);
      res.send(
        toCsv(
          ["Sana", "Kategoriya", "Summa", "Izoh", "Kim kiritdi"],
          items.map((e) => [e.spentOn, e.category, e.amount, e.note ?? "", e.createdByName ?? ""]),
        ),
      );
    }),
  );

  /**
   * Full JSON snapshot. Restoring is deliberately *not* an endpoint — a
   * "replace the whole database" button reachable from a browser session is a
   * foot-gun no amount of confirmation dialog makes safe. Restore runs from the
   * CLI instead: `npm run db:restore -- <file> --yes`.
   */
  app.get(
    "/api/backup",
    requireRole("admin"),
    handle(async (req, res) => {
      const [patientsAll, ordersAll, testsAll, usersAll, expensesAll, settings] = await Promise.all([
        storage.listPatients(),
        storage.listOrders(),
        storage.listTests(),
        storage.listUsers(),
        storage.listExpenses(),
        storage.getSettings(),
      ]);

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="medlab-backup-${stamp()}.json"`);
      res.setHeader("Cache-Control", "no-store");
      await audit(req, "export", "backup", null, "To'liq zaxira nusxa yuklandi");
      res.send(
        JSON.stringify(
          {
            version: 2,
            exportedAt: new Date().toISOString(),
            settings,
            // Passwords are hashes, but they are still credentials — a backup
            // file gets emailed around, so they do not travel with it.
            users: usersAll.map(({ ...u }) => u),
            tests: testsAll,
            patients: patientsAll.items,
            orders: ordersAll.items,
            expenses: expensesAll.items,
          },
          null,
          2,
        ),
      );
    }),
  );

  // ------------------------------------------------------------ reporting

  app.get(
    "/api/stats",
    requireAuth,
    handle(async (_req, res) => {
      res.json(await storage.getDashboardStats());
    }),
  );

  app.get(
    "/api/reports/revenue",
    requireRole("admin"),
    handle(async (req, res) => {
      const today = localDay(new Date());
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 29);
      const from = typeof req.query.from === "string" ? req.query.from : localDay(defaultFrom);
      const to = typeof req.query.to === "string" ? req.query.to : today;
      res.json(await storage.getRevenueReport(from, to));
    }),
  );

  // -------------------------------------------------------------- settings

  app.get(
    "/api/settings",
    requireAuth,
    handle(async (_req, res) => {
      res.json(await storage.getSettings());
    }),
  );

  app.put(
    "/api/settings",
    requireRole("admin"),
    handle(async (req, res) => {
      const saved = await storage.updateSettings(labSettingsSchema.parse(req.body));
      await audit(req, "update", "settings", "default", "Laboratoriya ma'lumotlari yangilandi");
      res.json(saved);
    }),
  );

  // ----------------------------------------------------------------- users

  app.get(
    "/api/users",
    requireRole("admin"),
    handle(async (_req, res) => {
      res.json(await storage.listUsers());
    }),
  );

  app.post(
    "/api/users",
    requireRole("admin"),
    handle(async (req, res) => {
      const input = insertUserSchema.parse(req.body);
      if (await storage.getUserByUsername(input.username)) {
        return res.status(409).json({ message: "Bu login allaqachon band" });
      }
      const user = await storage.createUser(input);
      await audit(req, "create", "user", user.id, `${user.fullName} (${user.role}) qo'shildi`);
      res.status(201).json(user);
    }),
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
      const what = input.password ? "paroli almashtirildi" : "ma'lumotlari yangilandi";
      await audit(req, "update", "user", user.id, `${user.fullName} — ${what}`);
      res.json(user);
    }),
  );

  /**
   * Clears an account's lockout.
   *
   * The escape hatch the escalation needs: without it, a laborant who mistypes
   * their password four times takes the results workflow offline for a week,
   * and a single locked administrator would strand the whole lab.
   */
  app.post(
    "/api/users/:id/unlock",
    requireRole("admin"),
    handle(async (req, res) => {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

      await storage.setLockState(user.id, registerSuccess());
      await audit(req, "update", "user", user.id, `${user.fullName} — hisob qulfi ochildi`);

      const { password: _password, ...pub } = user;
      res.json({ ...pub, failedAttempts: 0, lockedUntil: null, lockLevel: 0 });
    }),
  );

  app.delete(
    "/api/users/:id",
    requireRole("admin"),
    handle(async (req, res) => {
      if (req.params.id === req.user?.id) {
        return res.status(400).json({ message: "O'z hisobingizni o'chira olmaysiz" });
      }
      const before = await storage.getUser(req.params.id);
      const ok = await storage.deleteUser(req.params.id);
      if (!ok) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      await audit(req, "delete", "user", req.params.id, `${before?.fullName ?? "Xodim"} o'chirildi`);
      res.sendStatus(204);
    }),
  );

  // Turn validation and storage rejections into clean Uzbek API errors before
  // they reach the generic 500 handler in index.ts.
  app.use("/api", (err: unknown, _req: Request, res: Response, next: NextFunction) => {
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
