import { Bot, GrammyError, Keyboard, webhookCallback } from "grammy";
import type { RequestHandler } from "express";
import type {
  LabSettings,
  OrderWithDetails,
  Patient,
  TelegramPhoneStatus,
} from "@shared/schema";
import { normalizeUzPhone } from "@shared/schema";
import { storage } from "./storage";
import { log } from "./logger";

/**
 * Telegram delivery of ready results.
 *
 * The patient presses /start, shares their contact, and the chat is bound to
 * the patient row whose phone carries the same nine national digits. From then
 * on every order that reaches "completed" is pushed to that chat. Orders that
 * became ready *before* the patient connected are delivered right after the
 * contact arrives, so nothing is lost by connecting late.
 *
 * Vercel freezes an instance between requests, so polling is not an option:
 * updates arrive on the webhook route registered in routes.ts.
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

/** False when TELEGRAM_BOT_TOKEN is unset — every entry point then no-ops. */
export const telegramEnabled = Boolean(token);

/**
 * Webhook on Vercel, long polling everywhere else.
 *
 * grammY refuses to do both on one bot instance — and rightly so, since only
 * one of them can receive an update. The deployment decides: a serverless
 * function is frozen between requests and must be pushed to, while a laptop or
 * a VPS keeps a process alive and can pull.
 */
export const telegramUsesWebhook = Boolean(process.env.VERCEL);

/** Optional shared secret; Telegram echoes it in X-Telegram-Bot-Api-Secret-Token. */
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;

// A single message may not exceed 4096 characters. Long panels are split.
const MAX_MESSAGE = 3500;

const CONTACT_BUTTON = "📱 Telefon raqamimni yuborish";

const FLAG_MARKS: Record<string, string> = { low: "🔻", high: "🔺", normal: "✅" };

const contactKeyboard = () => new Keyboard().requestContact(CONTACT_BUTTON).resized().oneTime();

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** All line items present and filled in — the same rule the results queue uses. */
export function isOrderReady(order: OrderWithDetails): boolean {
  return order.items.length > 0 && order.items.every((i) => Boolean(i.result));
}

/** The patient-facing panel: one line per test, with reference ranges. */
export function buildResultMessage(order: OrderWithDetails, settings: LabSettings): string[] {
  const head = [
    `🧪 <b>${escapeHtml(settings.labName)}</b> — tahlil natijasi`,
    "",
    `Hurmatli <b>${escapeHtml(order.patient?.fullName ?? "bemor")}</b>,`,
    `<b>#${order.orderNumber}</b> raqamli buyurtmangiz natijalari tayyor` +
      (order.completedAt ? ` (${formatDate(order.completedAt)}).` : "."),
    "",
  ].join("\n");

  const items = order.items.map((item) => {
    const mark = (item.flag && FLAG_MARKS[item.flag]) || "•";
    const value = [item.result, item.unit].filter(Boolean).join(" ");
    let line = `${mark} <b>${escapeHtml(item.testName)}</b>: ${escapeHtml(value)}`;
    if (item.referenceRange) line += `\n     <i>me'yor: ${escapeHtml(item.referenceRange)}</i>`;
    if (item.notes) line += `\n     <i>${escapeHtml(item.notes)}</i>`;
    return line;
  });

  const foot = [
    "",
    "ℹ️ Natijalar tashxis o'rnini bosmaydi — shifokoringiz bilan maslahatlashing.",
    settings.phone ? `☎️ ${escapeHtml(settings.phone)}` : null,
    settings.address ? `📍 ${escapeHtml(settings.address)}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // Pack the lines into as few messages as Telegram's size limit allows.
  const chunks: string[] = [];
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

// ------------------------------------------------------------------ the bot

let instance: Bot | null = null;

function getBot(): Bot {
  if (!instance) {
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
    instance = new Bot(token);
    registerHandlers(instance);
    instance.catch((err) => console.error("[telegram]", err.error));
  }
  return instance;
}

function registerHandlers(bot: Bot) {
  bot.command("start", async (ctx) => {
    const linked = await patientOfChat(ctx.chat.id);
    if (linked) {
      await ctx.reply(
        `Assalomu alaykum, <b>${escapeHtml(linked.fullName)}</b>! Siz allaqachon ulangansiz — ` +
          "tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.\n\n" +
          "/natijalarim — oxirgi natijalaringizni ko'rish\n/stop — xabarnomalarni to'xtatish",
        { parse_mode: "HTML" },
      );
      return;
    }
    await ctx.reply(
      "Assalomu alaykum! 👋\n\nTahlil natijalaringizni shu yerdan olish uchun pastdagi tugma orqali " +
        "telefon raqamingizni yuboring. Raqam laboratoriyada ro'yxatdan o'tgan raqam bilan bir xil bo'lishi kerak.",
      { reply_markup: contactKeyboard() },
    );
  });

  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    // Only the sender's own contact may be linked — otherwise anyone could
    // forward someone else's card and read their results.
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply(
        "Iltimos, <b>o'zingizning</b> raqamingizni tugma orqali yuboring.",
        { parse_mode: "HTML", reply_markup: contactKeyboard() },
      );
      return;
    }

    const patient = await storage.getPatientByPhone(contact.phone_number);
    if (!patient) {
      // Not a patient yet — most people open the bot before their first visit.
      // Park the chat: the registration form will show the registrator that
      // this number is waiting, and creating the patient claims it.
      await storage.savePendingContact({
        chatId: String(ctx.chat.id),
        phone: normalizeUzPhone(contact.phone_number),
        fullName: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        username: ctx.from.username ?? null,
      });
      await ctx.reply(
        "Rahmat, raqamingiz qabul qilindi! ✅\n\n" +
          "Hozircha bu raqam bo'yicha ro'yxatdan o'tmagansiz. Laboratoriyaga kelib ro'yxatdan " +
          "o'tishingiz bilan shu chat avtomatik bog'lanadi va natijalaringiz shu yerga keladi.",
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    await storage.linkTelegram(patient.id, String(ctx.chat.id));
    await ctx.reply(
      `Rahmat, <b>${escapeHtml(patient.fullName)}</b>! ✅\n\n` +
        "Bundan buyon tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.",
      { parse_mode: "HTML", reply_markup: { remove_keyboard: true } },
    );

    // Anything that went ready while they were not connected yet.
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
      await ctx.reply("Hozircha tayyor natijangiz yo'q. Tayyor bo'lishi bilan xabar beramiz. ⏳");
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
      removed
        ? "Xabarnomalar to'xtatildi. Qayta ulanish uchun /start bosing."
        : "Siz ulanmagansiz. Ulanish uchun /start bosing.",
      { reply_markup: { remove_keyboard: true } },
    );
  });

  bot.on("message", async (ctx) => {
    const patient = await patientOfChat(ctx.chat.id);
    if (patient) {
      await ctx.reply(
        "Natijalaringiz tayyor bo'lishi bilan avtomatik yuboriladi.\n\n" +
          "/natijalarim — oxirgi natijalar\n/stop — xabarnomalarni to'xtatish",
      );
      return;
    }
    await ctx.reply("Boshlash uchun telefon raqamingizni yuboring.", { reply_markup: contactKeyboard() });
  });
}

/** The patient a chat belongs to, or undefined when the chat is not linked. */
function patientOfChat(chatId: number | string): Promise<Patient | undefined> {
  return storage.getPatientByChatId(String(chatId));
}

// ------------------------------------------------------------- entry points

/** Express handler for POST /api/telegram/webhook. */
export function telegramWebhook(): RequestHandler {
  const callback = webhookCallback(getBot(), "express", { secretToken: webhookSecret });
  return async (req, res) => {
    try {
      await callback(req, res);
    } catch (err) {
      console.error("[telegram] webhook", err);
      // Always 200: a non-2xx makes Telegram redeliver the same update forever.
      if (!res.headersSent) res.sendStatus(200);
    }
  };
}

/**
 * Called right after a patient is registered (or their phone is corrected):
 * if that number was waiting in the bot, the chat becomes theirs immediately.
 * Anything already ready for them is delivered in the same breath.
 */
export async function claimPendingContact(patient: Patient): Promise<Patient> {
  if (!telegramEnabled || patient.telegramChatId) return patient;
  // Held outside the try so a failed greeting still reports the link that the
  // database already carries — the admin panel must not show them unlinked.
  let linked = patient;
  try {
    const pending = await storage.findPendingContact(patient.phone);
    if (!pending) return patient;

    // Link first, drop the waiting row only once the link is stored. The other
    // order loses the contact for good if the second write fails; this way the
    // worst case is a stale row that the next save picks up again.
    linked = (await storage.linkTelegram(patient.id, pending.chatId)) ?? patient;
    await storage.deletePendingContact(pending.chatId);

    const settings = await storage.getSettings();
    await getBot().api.sendMessage(
      pending.chatId,
      `Assalomu alaykum, <b>${escapeHtml(linked.fullName)}</b>! ✅\n\n` +
        `${escapeHtml(settings.labName)} tizimida ro'yxatdan o'tdingiz. ` +
        "Tahlil natijalaringiz tayyor bo'lishi bilan shu yerga yuboriladi.",
      { parse_mode: "HTML" },
    );

    for (const order of (await storage.listUndeliveredOrders(linked.id)).reverse()) {
      await deliverOrderResults(order);
    }
  } catch (err) {
    // Registration must never fail because Telegram is unreachable.
    console.error("[telegram] claim", err);
  }
  return linked;
}

/** Powers the "botni ochganmi?" hint on the registration form. */
export async function telegramPhoneStatus(phone: string): Promise<TelegramPhoneStatus> {
  if (!telegramEnabled) return { connected: false, source: null, telegramName: null };
  const patient = await storage.getPatientByPhone(phone);
  if (patient?.telegramChatId) return { connected: true, source: "patient", telegramName: null };
  const pending = await storage.findPendingContact(phone);
  if (pending) return { connected: true, source: "pending", telegramName: pending.fullName };
  return { connected: false, source: null, telegramName: null };
}

/**
 * Long polling, for running the bot from a laptop without a public URL.
 *
 * Only ever called from the local entry point: polling and a webhook are
 * mutually exclusive, so a deployed instance must never call this — it would
 * unregister the production webhook and steal every update.
 */
export async function startTelegramPolling(): Promise<void> {
  if (!telegramEnabled || telegramUsesWebhook) return;
  const bot = getBot();
  const hook = await bot.api.getWebhookInfo();
  if (hook.url) {
    log(`[telegram] webhook o'rnatilgan (${hook.url}) — polling ishga tushirilmadi`);
    return;
  }
  const me = await telegramBotInfo();
  // start() never resolves while the bot runs, so it is deliberately not awaited.
  void bot.start({
    allowed_updates: ["message"],
    drop_pending_updates: true,
    onStart: () => log(`[telegram] @${me?.username} polling rejimida ishlayapti`),
  });
}

export type DeliveryResult = { sent: boolean; reason?: string };

/**
 * Sends one order's results to its patient. Safe to call on every save: it
 * refuses anything that is not a fully filled, not-yet-delivered order of a
 * connected patient, and reports why.
 */
export async function deliverOrderResults(
  order: OrderWithDetails,
  opts: { force?: boolean } = {},
): Promise<DeliveryResult> {
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
    // 403 means the patient blocked the bot or deleted the chat: drop the link
    // so the admin panel shows them as disconnected instead of retrying daily.
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

/** Fire-and-forget wrapper for the save-results path: never fails the request. */
export async function notifyIfReady(order: OrderWithDetails): Promise<DeliveryResult> {
  if (!telegramEnabled) return { sent: false, reason: "Telegram bot sozlanmagan" };
  try {
    return await deliverOrderResults(order);
  } catch (err) {
    console.error("[telegram] notify", err);
    return { sent: false, reason: err instanceof Error ? err.message : "Xatolik" };
  }
}

/** Bot identity for the settings screen; null when the token is missing or bad. */
let cachedMe: { id: number; username: string } | null = null;

export async function telegramBotInfo(): Promise<{ id: number; username: string } | null> {
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
