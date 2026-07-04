/**
 * simpleAuth.ts — Single-owner passcode auth
 *
 * If OWNER_PASSCODE is set in .env, every /api route (except the public
 * booking endpoints whitelisted in routes.ts) requires a session that was
 * established via POST /api/login with the correct passcode. The session
 * cookie lasts 1 year, so Willis logs in roughly once per device per year.
 *
 * If OWNER_PASSCODE is NOT set, the app falls back to the old behavior:
 * every request is automatically the owner (safe only for local-only use).
 */

import session from "express-session";
import connectPg from "connect-pg-simple";
import { timingSafeEqual } from "crypto";
import type { Express, RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    userId: string;
    userEmail: string;
    userFirstName: string | null;
    userLastName: string | null;
    profileImageUrl: string | null;
  }
}

const PASSCODE = process.env.OWNER_PASSCODE?.trim() || "";
const passcodeModeEnabled = PASSCODE.length > 0;

function passcodeMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(PASSCODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- Simple in-memory login rate limit: 10 attempts / 15 min per IP ---
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export function getSession() {
  const sessionTtl = 365 * 24 * 60 * 60 * 1000; // 1 year
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure cookies in production (Replit serves HTTPS; trust proxy is set).
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

// Cached owner info so we don't hit the DB every request
let cachedOwner: { id: string; email: string; firstName: string | null; lastName: string | null } | null = null;

async function getOwner() {
  if (cachedOwner) return cachedOwner;

  const { db } = await import("./db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const ownerEmail = process.env.OWNER_EMAIL!;

  let [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);

  if (!user) {
    const [created] = await db.insert(users).values({
      id: `owner-${Date.now()}`,
      email: ownerEmail,
      firstName: "John",
      lastName: "Willis",
      profileImageUrl: null,
    }).returning();
    user = created;
  }

  cachedOwner = {
    id: user.id,
    email: user.email ?? ownerEmail,
    firstName: user.firstName ?? "John",
    lastName: user.lastName ?? "Willis",
  };

  return cachedOwner;
}

type SessionRequest = { session: session.Session & Partial<session.SessionData> };

async function attachOwnerToSession(req: SessionRequest) {
  const owner = await getOwner();
  req.session.authenticated = true;
  req.session.userId = owner.id;
  req.session.userEmail = owner.email;
  req.session.userFirstName = owner.firstName;
  req.session.userLastName = owner.lastName;
  req.session.profileImageUrl = null;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  if (!passcodeModeEnabled) {
    // Legacy auto-auth: every request becomes the owner. Local-only safety net.
    app.use(async (req, _res, next) => {
      if (!req.session.authenticated) {
        try {
          await attachOwnerToSession(req);
        } catch {
          // If DB isn't ready yet, just continue — will retry next request
        }
      }
      next();
    });
  }

  app.post("/api/login", async (req, res) => {
    if (!passcodeModeEnabled) {
      return res.json({ ok: true });
    }
    const ip = req.ip ?? "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    }
    const passcode = typeof req.body?.passcode === "string" ? req.body.passcode : "";
    if (!passcodeMatches(passcode)) {
      return res.status(401).json({ message: "Incorrect passcode." });
    }
    try {
      await attachOwnerToSession(req);
      attempts.delete(ip); // reset rate limit on success
      res.json({ ok: true });
    } catch (err) {
      console.error("Login failed:", err);
      res.status(500).json({ message: "Could not establish session." });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    if (passcodeModeEnabled && !req.session.authenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const owner = await getOwner();
    res.json({
      id: req.session.userId ?? owner.id,
      email: req.session.userEmail ?? owner.email,
      firstName: req.session.userFirstName ?? owner.firstName,
      lastName: req.session.userLastName ?? owner.lastName,
      profileImageUrl: null,
      createdAt: null,
      updatedAt: null,
    });
  });
}

// Requires a passcode-established session when passcode mode is on;
// passes everything through when it's off (legacy local-only mode).
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!passcodeModeEnabled) return next();
  if (req.session?.authenticated) return next();
  res.status(401).json({ message: "Not authenticated" });
};
