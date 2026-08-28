import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { registerRoutes } from "./routes";
import { log } from "./logger";

/**
 * Builds the Express app with everything both runtimes share: body parsing,
 * request logging, auth, the API, and the error handler.
 *
 * Deliberately free of vite and of `listen()` so it can be imported by the
 * Vercel serverless function without dragging the dev server into the bundle.
 */
export async function createApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 120) logLine = logLine.slice(0, 119) + "…";
      log(logLine);
    });

    next();
  });

  await registerRoutes(app);

  // Last-resort handler. It logs rather than rethrows: rethrowing here would
  // take down the whole process (and, on serverless, the running instance).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500;
    const message = err instanceof Error ? err.message : "Ichki xatolik";
    console.error("[error]", err);
    if (!res.headersSent) res.status(status || 500).json({ message });
  });

  return app;
}
