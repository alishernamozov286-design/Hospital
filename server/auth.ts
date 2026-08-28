import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { PublicUser, Role } from "@shared/schema";
import { verifyPassword } from "./password";
import { storage } from "./storage";
import { pool } from "./db-pg";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends PublicUser {}
  }
}

const MemoryStore = createMemoryStore(session);
const PgSession = connectPgSimple(session);

/**
 * Sessions live in Postgres whenever a database is configured.
 *
 * This is not just a nicety: on serverless every request may hit a different
 * instance, so an in-memory store would log the user straight back out. The
 * memory store is only the local, no-database fallback.
 */
function createSessionStore() {
  if (!process.env.DATABASE_URL) {
    return new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 });
  }
  return new PgSession({
    pool: pool, // Pool obyektini to'g'ridan-to'g'ri ulash
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60, // seconds
  });
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "medlab-dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      store: createSessionStore(),
      // The session is only ended by an explicit logout, so the cookie is given
      // a year and `rolling` pushes that expiry forward on every request.
      rolling: true,
      cookie: {
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    }),
  );

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await verifyPassword(password, user.password))) {
          return done(null, false, { message: "Login yoki parol noto'g'ri" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "Hisob bloklangan. Administratorga murojaat qiling" });
        }
        const { password: _password, ...pub } = user;
        return done(null, pub);
      } catch (err) {
        return done(err as Error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user || !user.isActive) return done(null, false);
      const { password: _password, ...pub } = user;
      done(null, pub);
    } catch (err) {
      done(err as Error);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());
}

// ------------------------------------------------------------ brute force

/**
 * Login throttling, keyed on username *and* client IP together.
 *
 * Keying on the username alone would hand anyone a denial-of-service: guess a
 * colleague's login wrong five times and they are locked out. Keying on IP
 * alone lets one attacker walk the whole staff list from a single address, and
 * locks out a whole clinic behind one NAT. The pair is what makes the limit
 * bite on the attack without becoming a weapon.
 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

type Attempt = { count: number; firstAt: number; blockedUntil: number };
const attempts = new Map<string, Attempt>();

/** Bounded so a flood of distinct usernames cannot grow this without limit. */
const MAX_TRACKED = 5000;

function attemptKey(req: Request): string {
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  return `${req.ip ?? "?"}|${username}`;
}

function sweep(now: number) {
  for (const [key, a] of attempts) {
    if (now - a.firstAt > WINDOW_MS && now > a.blockedUntil) attempts.delete(key);
  }
  // Still oversized after dropping the expired: forget the oldest first.
  if (attempts.size > MAX_TRACKED) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt);
    for (const [key] of oldest.slice(0, attempts.size - MAX_TRACKED)) attempts.delete(key);
  }
}

/** Rejects the request outright while a key is serving its cool-off. */
export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  sweep(now);

  const entry = attempts.get(attemptKey(req));
  if (entry && now < entry.blockedUntil) {
    const minutes = Math.ceil((entry.blockedUntil - now) / 60000);
    return res.status(429).json({
      message: `Juda ko'p urinish. ${minutes} daqiqadan so'ng qayta urinib ko'ring`,
    });
  }
  next();
}

export function recordFailedLogin(req: Request) {
  const now = Date.now();
  const key = attemptKey(req);
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + WINDOW_MS;
    entry.count = 0;
    entry.firstAt = now;
  }
}

/** A correct password clears the record — an honest typo should cost nothing. */
export function clearFailedLogins(req: Request) {
  attempts.delete(attemptKey(req));
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ message: "Avval tizimga kiring" });
  }
  next();
}

/** Admin passes every gate; other roles must be listed explicitly. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ message: "Avval tizimga kiring" });
    }
    const role = req.user?.role as Role | undefined;
    if (role !== "admin" && (!role || !roles.includes(role))) {
      return res.status(403).json({ message: "Bu amal uchun ruxsatingiz yo'q" });
    }
    next();
  };
}
