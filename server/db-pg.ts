import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

// Neon's driver speaks WebSocket; Node has no global one, so supply it.
neonConfig.webSocketConstructor = ws;

/**
 * Send plain queries over HTTP instead of opening a WebSocket. On serverless
 * this matters a lot: a lambda that idles between invocations kept losing its
 * socket (ECONNRESET / close code 1006), which surfaced as a 500. Transactions
 * still use a WebSocket, since they need a real session.
 */
neonConfig.poolQueryViaFetch = true;

/**
 * WebSocket xavfsizligini ta'minlash va pipelineConnect o'chirish -
 * ba'zan ulanish muammolariga sabab bo'lishi mumkin.
 */
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = false;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL topilmadi — .env faylini tekshiring");
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000, // 10 soniya
  idleTimeoutMillis: 30000, // 30 soniya
  max: 10, // maksimal connection soni
  // Query timeout - agar so'rov juda uzoq davom etsa, bekor qiladi
  query_timeout: 30000, // 30 soniya
  // Statement timeout - har bir SQL statement uchun
  statement_timeout: 30000, // 30 soniya
});

// An idle client dropped by the network emits on the pool, not on the query.
// Without this listener it becomes an unhandled rejection and kills the process.
pool.on("error", (err) => {
  console.error("[db] pool xatosi (so'rov qayta uriniladi):", err.message);
});

export const db = drizzle(pool, { schema });
