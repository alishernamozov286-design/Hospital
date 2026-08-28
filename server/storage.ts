import type { IStorage } from "./storage-types";

export * from "./storage-types";

/**
 * Postgres when DATABASE_URL is configured, otherwise the local JSON store so
 * the app still runs with zero setup. Both satisfy the same IStorage contract,
 * so nothing above this line needs to know which one is active.
 */
export const usingPostgres = Boolean(process.env.DATABASE_URL);

async function createStorage(): Promise<IStorage> {
  if (usingPostgres) {
    const { PgStorage } = await import("./storage-pg");
    return new PgStorage();
  }
  const { FileStorage } = await import("./storage-file");
  return new FileStorage();
}

export const storage: IStorage = await createStorage();
