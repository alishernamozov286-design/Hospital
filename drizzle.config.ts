import { defineConfig } from "drizzle-kit";

// Same built-in loader the server uses, so `npm run db:push` works without
// exporting DATABASE_URL by hand.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL topilmadi — .env faylini yarating (.env.example dan nusxa oling)");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
