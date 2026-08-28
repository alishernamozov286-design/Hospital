/**
 * Registers (or inspects) the Telegram webhook. Run it once after a deploy —
 * Telegram remembers the URL, so it does not need to run on every release.
 *
 *   node scripts/telegram-webhook.mjs info
 *   node scripts/telegram-webhook.mjs set https://sizning-domen.vercel.app
 *   node scripts/telegram-webhook.mjs delete
 *
 * The URL is the site root; "/api/telegram/webhook" is appended automatically.
 * With TELEGRAM_WEBHOOK_SECRET set in .env the secret is registered too, so
 * Telegram signs every update and foreign POSTs are rejected.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — the token may still come from the environment
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN topilmadi — .env fayliga qo'shing.");
  process.exit(1);
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const [command = "info", target] = process.argv.slice(2);

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`${method}: ${data.description}`);
    process.exit(1);
  }
  return data.result;
}

const me = await api("getMe");
console.log(`Bot: @${me.username} (${me.first_name})`);

if (command === "set") {
  if (!target) {
    console.error("Manzilni ko'rsating: node scripts/telegram-webhook.mjs set https://domen.vercel.app");
    process.exit(1);
  }
  const url = `${target.replace(/\/+$/, "")}/api/telegram/webhook`;
  await api("setWebhook", {
    url,
    secret_token: secret || undefined,
    // Telegram would otherwise replay everything queued while the bot was down.
    drop_pending_updates: true,
    allowed_updates: ["message"],
  });
  console.log(`✅ Webhook o'rnatildi: ${url}${secret ? " (secret bilan)" : ""}`);
} else if (command === "delete") {
  await api("deleteWebhook", { drop_pending_updates: true });
  console.log("🗑️  Webhook o'chirildi");
} else {
  const info = await api("getWebhookInfo");
  console.log(`Webhook: ${info.url || "(o'rnatilmagan)"}`);
  console.log(`Kutilayotgan yangilanishlar: ${info.pending_update_count}`);
  if (info.last_error_message) {
    console.log(`Oxirgi xato: ${info.last_error_message} (${new Date(info.last_error_date * 1000).toISOString()})`);
  }
}
