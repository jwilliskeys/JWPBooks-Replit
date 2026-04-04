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
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/login", async (req, res) => {
    const { passcode } = req.body;
    const ownerPasscode = process.env.OWNER_PASSCODE;

    if (!ownerPasscode) {
      return res.status(500).json({ message: "App is not configured yet. Set OWNER_PASSCODE." });
    }

    if (passcode !== ownerPasscode) {
      return res.status(401).json({ message: "Incorrect passcode" });
    }

    const ownerEmail = process.env.OWNER_EMAIL;
    let userId = "owner";
    let userFirstName: string | null = null;
    let userLastName: string | null = null;
    let profileImageUrl: string | null = null;

    if (ownerEmail) {
      try {
        const { db } = await import("./db");
        const { users } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [user] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
        if (user) {
          userId = user.id;
          userFirstName = user.firstName ?? null;
          userLastName = user.lastName ?? null;
          profileImageUrl = user.profileImageUrl ?? null;
        }
      } catch {
        // Fall through with "owner" userId
      }
    }

    req.session.authenticated = true;
    req.session.userId = userId;
    req.session.userEmail = ownerEmail ?? "";
    req.session.userFirstName = userFirstName;
    req.session.userLastName = userLastName;
    req.session.profileImageUrl = profileImageUrl;

    res.json({ ok: true });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.session.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({
      id: req.session.userId,
      email: req.session.userEmail,
      firstName: req.session.userFirstName ?? null,
      lastName: req.session.userLastName ?? null,
      profileImageUrl: req.session.profileImageUrl ?? null,
      createdAt: null,
      updatedAt: null,
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
