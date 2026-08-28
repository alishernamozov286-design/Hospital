/**
 * Side-effect module: loads .env into process.env.
 *
 * ESM evaluates imports before any module body, so this must be imported
 * FIRST in server/index.ts — otherwise storage.ts would read DATABASE_URL
 * before it exists and silently fall back to the JSON store.
 *
 * Uses Node's built-in loader (>=20.6), so no dotenv dependency.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — that is fine, the app falls back to .data/db.json
}

export {};
