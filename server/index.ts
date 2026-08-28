import "./env"; // must stay first — populates process.env for every module below
import { createServer } from "http";
import { createApp } from "./app";
import { log } from "./logger";
import { serveStatic, setupVite } from "./vite";
import { startTelegramPolling } from "./telegram";

/** Local runtime: one long-lived process serving both the API and the client. */
const app = await createApp();
const server = createServer(app);

// Vite must come after the API routes so its catch-all does not swallow them.
if (app.get("env") === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

const port = parseInt(process.env.PORT || "5000", 10);

/**
 * Bound to every interface, IPv6 included — omitting `host` makes Node listen
 * on the dual-stack wildcard, where "0.0.0.0" is IPv4 only.
 *
 * This is a performance fix, not a nicety. Browsers resolve "localhost" to ::1
 * first; with an IPv4-only socket that connection is refused and the browser
 * falls back to 127.0.0.1, and on Windows that fallback costs ~200ms. Measured
 * here it was 205ms per connection against 3ms direct to 127.0.0.1 — and a Vite
 * dev page pulls hundreds of module requests, so the tax landed on every one of
 * them and made a refresh feel broken.
 */
server.listen(
  {
    port,
    // SO_REUSEPORT is not supported on Windows (listen ENOTSUP)
    reusePort: process.platform !== "win32",
  },
  () => log(`serving on port ${port} — http://localhost:${port}`),
);

// This process is long-lived, so the bot can poll instead of needing a public
// webhook URL. On Vercel the entry point is serverless.ts, which never gets
// here — there the same handlers are driven by /api/telegram/webhook.
void startTelegramPolling();
