/**
 * Boots the server against the local JSON store, ignoring any configured
 * DATABASE_URL.
 *
 * The app loads .env for itself (see server/env.ts), so clearing the variable
 * from the outside does not work — it has to be cleared *after* that load and
 * *before* server/index.ts pulls in the storage layer, which is exactly what
 * the import order below does.
 *
 * Point MEDLAB_TEST_DIR at a scratch directory and this gives a throwaway
 * instance to click through without touching the real database.
 */
import "../server/env";

delete process.env.DATABASE_URL;

await import("../server/index");
