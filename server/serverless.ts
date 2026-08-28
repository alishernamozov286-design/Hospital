import "./env";
import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "./app";

/**
 * Source for the Vercel serverless function; esbuild bundles it into
 * `api/index.js` (see the build:api script). Bundling is required because
 * Vercel compiles TypeScript files individually, which leaves extension-less
 * relative imports that Node's ESM loader rejects — and it also resolves the
 * `@shared/*` path alias.
 *
 * Every `/api/*` request is routed here by an explicit rule in vercel.json.
 * The filename-based catch-all (`api/[...slug].ts`) was tried first and only
 * ever matched a single path segment on this project type, so `/api/reports/
 * revenue` 404'd at the edge.
 */
// A dropped database socket must not take the instance down with it: without
// these, one transient rejection exits the process and the caller gets an
// opaque 500 instead of a handled error.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const appPromise = createApp();

/**
 * vercel.json passes the untouched path as `__path` because a `dest` rewrite
 * replaces `req.url` with the destination. Restore it — with the caller's own
 * query string intact — before Express sees the request.
 */
function restoreOriginalUrl(req: IncomingMessage) {
  if (!req.url) return;
  const url = new URL(req.url, "http://localhost");
  const original = url.searchParams.get("__path");
  if (!original) return;

  url.searchParams.delete("__path");
  const query = url.searchParams.toString();
  req.url = query ? `${original}?${query}` : original;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreOriginalUrl(req);
  const app = await appPromise;
  app(req as never, res as never);
}
