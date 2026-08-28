/**
 * Standalone so that app.ts can log without importing server/vite.ts, which
 * pulls in the whole vite dev server.
 */
export function log(message: string, source = "express") {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${time} [${source}] ${message}`);
}
