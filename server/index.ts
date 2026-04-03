import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabaseIfEmpty } from "./seed";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function migrateExistingDataToUser() {
  const { db } = await import("./db");
  const { customers, appointments, calendarNotes, calendarEvents, trips, invoices, users } = await import("@shared/schema");
  const { isNull, isNotNull, eq, count } = await import("drizzle-orm");

  try {
    const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

    if (allUsers.length === 0) {
      log("Startup migration: no users yet, skipping data claim.", "migration");
      return;
    }

    let claimUser: { id: string; email: string | null } | undefined;

    if (allUsers.length === 1) {
      claimUser = allUsers[0];
    } else {
      // Multiple users: find the one with the most existing claimed rows (they're the primary user)
      const [existing] = await db
        .select({ userId: customers.userId, cnt: count() })
        .from(customers)
        .where(isNotNull(customers.userId))
        .groupBy(customers.userId)
        .orderBy(count())
        .limit(1);

      if (existing?.userId) {
        const found = allUsers.find(u => u.id === existing.userId);
        claimUser = found;
      }

      if (!claimUser) {
        log(`Startup migration: ${allUsers.length} users, no primary user determined, skipping.`, "migration");
        return;
      }
    }

    const userId = claimUser.id;
    const userEmail = claimUser.email || userId;

    const r1 = await db.update(customers).set({ userId }).where(isNull(customers.userId)).returning({ id: customers.id });
    const r2 = await db.update(appointments).set({ userId }).where(isNull(appointments.userId)).returning({ id: appointments.id });
    const r3 = await db.update(calendarNotes).set({ userId }).where(isNull(calendarNotes.userId)).returning({ id: calendarNotes.id });
    const r4 = await db.update(calendarEvents).set({ userId }).where(isNull(calendarEvents.userId)).returning({ id: calendarEvents.id });
    const r5 = await db.update(trips).set({ userId }).where(isNull(trips.userId)).returning({ id: trips.id });
    const r6 = await db.update(invoices).set({ userId }).where(isNull(invoices.userId)).returning({ id: invoices.id });

    const total = r1.length + r2.length + r3.length + r4.length + r5.length + r6.length;

    if (total === 0) {
      log("Startup migration: all records already have userId set.", "migration");
    } else {
      log(`Startup migration: claimed ${total} records for user ${userEmail} (customers:${r1.length}, appointments:${r2.length}, notes:${r3.length}, events:${r4.length}, trips:${r5.length}, invoices:${r6.length})`, "migration");
    }
  } catch (err: any) {
    log(`Startup migration error: ${err.message}`, "migration");
  }
}

(async () => {
  await setupAuth(app);
  registerAuthRoutes(app);

  await seedDatabaseIfEmpty();
  await migrateExistingDataToUser();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
