/**
 * simpleAuth.ts — Single-owner auto-auth
 *
 * No login screen. Every request is automatically the owner.
 * The owner user is looked up (or created) once on startup and
 * injected into every session transparently.
 */

import session from "express-session";
import connectPg from "connect-pg-simple";
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
      secure: false, // local dev — no HTTPS needed
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

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Auto-inject owner session on every request that doesn't already have one
  app.use(async (req, _res, next) => {
    if (!req.session.authenticated) {
      try {
        const owner = await getOwner();
        req.session.authenticated = true;
        req.session.userId = owner.id;
        req.session.userEmail = owner.email;
        req.session.userFirstName = owner.firstName;
        req.session.userLastName = owner.lastName;
        req.session.profileImageUrl = null;
      } catch {
        // If DB isn't ready yet, just continue — will retry next request
      }
    }
    next();
  });

  // Keep these routes for compatibility but they're effectively no-ops now
  app.post("/api/login", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/logout", (_req, res) => {
    // No-op — nothing to log out of
    res.redirect("/");
  });

  app.get("/api/auth/user", async (req, res) => {
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

// All requests pass — owner is always authenticated
export const isAuthenticated: RequestHandler = (_req, _res, next) => {
  next();
};
