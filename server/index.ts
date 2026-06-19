import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabaseIfEmpty } from "./seed";
import { seedOutreachIfEmpty } from "./seedOutreach";
import { setupAuth } from "./simpleAuth";
import { storage } from "./storage";

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

async function ensurePianoSchemaColumns() {
  const { pool } = await import("./db");
  try {
    await pool.query(`
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "serial_number" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "location" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "tags" text[];
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "tuning_interval" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "case_color" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "case_finish" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "size" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "use_type" text;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "on_consignment" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "has_ivory" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "needs_repair" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "total_loss" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "player_installed" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "piano_life_saver" boolean DEFAULT false;
      ALTER TABLE "pianos" ADD COLUMN IF NOT EXISTS "rental_piano" boolean DEFAULT false;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "repeat_end_date" text;
      ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "end_date" text;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_method" text;
      ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "receipt_url" text;
      CREATE TABLE IF NOT EXISTS "inspections" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" text,
        "customer_id" integer NOT NULL,
        "piano_id" integer,
        "type" text NOT NULL DEFAULT 'inspection',
        "inspection_date" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "overall_condition" text,
        "checklist_items" text DEFAULT '[]',
        "findings" text,
        "recommended_services" text DEFAULT '[]',
        "estimated_total" text,
        "invoice_id" integer,
        "summary" text,
        "photos" text[],
        "internal_notes" text,
        "created_at" timestamp DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "booking_requests" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" text,
        "first_name" text NOT NULL,
        "last_name" text NOT NULL,
        "email" text NOT NULL,
        "phone" text,
        "city_neighborhood" text,
        "piano_type" text,
        "last_tuned" text,
        "preferred_times" text,
        "status" text NOT NULL DEFAULT 'pending',
        "admin_notes" text,
        "converted_customer_id" integer,
        "converted_appointment_id" integer,
        "created_at" timestamp DEFAULT now()
      );
    `);
    log("Schema migration: pianos, calendar_events, invoices, business_expenses, inspections, and booking_requests ensured.", "migration");
  } catch (err: any) {
    log(`Schema migration error: ${err.message}`, "migration");
  }
}

async function migrateExistingDataToUser() {
  const { db } = await import("./db");
  const { customers, appointments, calendarNotes, calendarEvents, trips, invoices, users } = await import("@shared/schema");
  const { isNull, isNotNull, count, desc } = await import("drizzle-orm");

  try {
    // Check how many rows still need claiming across ALL affected tables
    const [c1] = await db.select({ cnt: count() }).from(customers).where(isNull(customers.userId));
    const [c2] = await db.select({ cnt: count() }).from(appointments).where(isNull(appointments.userId));
    const [c3] = await db.select({ cnt: count() }).from(calendarNotes).where(isNull(calendarNotes.userId));
    const [c4] = await db.select({ cnt: count() }).from(calendarEvents).where(isNull(calendarEvents.userId));
    const [c5] = await db.select({ cnt: count() }).from(trips).where(isNull(trips.userId));
    const [c6] = await db.select({ cnt: count() }).from(invoices).where(isNull(invoices.userId));
    const nullCount = Number(c1?.cnt ?? 0) + Number(c2?.cnt ?? 0) + Number(c3?.cnt ?? 0) +
                      Number(c4?.cnt ?? 0) + Number(c5?.cnt ?? 0) + Number(c6?.cnt ?? 0);

    if (nullCount === 0) {
      log("Startup migration: all records already have userId set.", "migration");
      return;
    }

    const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

    if (allUsers.length === 0) {
      log("Startup migration: no users yet — null-userId rows will be claimed on first login.", "migration");
      return;
    }

    let claimUser: { id: string; email: string | null } | undefined;

    if (allUsers.length === 1) {
      // Exactly one user — unambiguous, claim for them (original spec behavior)
      claimUser = allUsers[0];
    } else {
      // Multiple users: check env var first, then look for user with most existing claimed rows
      const ownerUserId = process.env.OWNER_USER_ID;
      const ownerEmail = process.env.OWNER_EMAIL;

      if (ownerUserId) {
        claimUser = allUsers.find(u => u.id === ownerUserId);
        if (!claimUser) {
          log(`Startup migration: OWNER_USER_ID=${ownerUserId} not found in users table. Skipping.`, "migration");
          return;
        }
      } else if (ownerEmail) {
        claimUser = allUsers.find(u => u.email === ownerEmail);
        if (!claimUser) {
          log(`Startup migration: OWNER_EMAIL=${ownerEmail} not found in users table. Skipping.`, "migration");
          return;
        }
      } else {
        // Fallback: find user with the most already-claimed rows (primary user heuristic)
        const [topUser] = await db
          .select({ userId: customers.userId, cnt: count() })
          .from(customers)
          .where(isNotNull(customers.userId))
          .groupBy(customers.userId)
          .orderBy(desc(count()))
          .limit(1);

        if (topUser?.userId) {
          claimUser = allUsers.find(u => u.id === topUser.userId);
        }
      }

      if (!claimUser) {
        log(
          `Startup migration: ${allUsers.length} users exist and ${nullCount} records have no userId, ` +
          `but the primary user cannot be determined automatically. ` +
          `Set OWNER_USER_ID or OWNER_EMAIL env var to identify who should own the existing data.`,
          "migration"
        );
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
    log(`Startup migration: claimed ${total} records for ${userEmail} (customers:${r1.length}, appointments:${r2.length}, notes:${r3.length}, events:${r4.length}, trips:${r5.length}, invoices:${r6.length})`, "migration");

    // Post-migration safety assertion — check ALL affected tables
    const [p1] = await db.select({ cnt: count() }).from(customers).where(isNull(customers.userId));
    const [p2] = await db.select({ cnt: count() }).from(appointments).where(isNull(appointments.userId));
    const [p3] = await db.select({ cnt: count() }).from(calendarNotes).where(isNull(calendarNotes.userId));
    const [p4] = await db.select({ cnt: count() }).from(calendarEvents).where(isNull(calendarEvents.userId));
    const [p5] = await db.select({ cnt: count() }).from(trips).where(isNull(trips.userId));
    const [p6] = await db.select({ cnt: count() }).from(invoices).where(isNull(invoices.userId));
    const remainingNulls = [
      { table: "customers", cnt: Number(p1?.cnt ?? 0) },
      { table: "appointments", cnt: Number(p2?.cnt ?? 0) },
      { table: "calendarNotes", cnt: Number(p3?.cnt ?? 0) },
      { table: "calendarEvents", cnt: Number(p4?.cnt ?? 0) },
      { table: "trips", cnt: Number(p5?.cnt ?? 0) },
      { table: "invoices", cnt: Number(p6?.cnt ?? 0) },
    ].filter(x => x.cnt > 0);
    if (remainingNulls.length > 0) {
      const summary = remainingNulls.map(x => `${x.table}:${x.cnt}`).join(", ");
      log(`WARNING: null-userId rows remain after migration (${summary}). Some data may be inaccessible.`, "migration");
    }
  } catch (err: any) {
    log(`Startup migration error: ${err.message}`, "migration");
  }
}

(async () => {
  await setupAuth(app);

  await seedDatabaseIfEmpty();
  await ensurePianoSchemaColumns();
  await migrateExistingDataToUser();
  await seedOutreachIfEmpty();
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

  // Listen on all interfaces so the app is reachable from other devices
  // on the local network (e.g. iPhone, iPad). Default port 3000.
  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on http://localhost:${port}`);
    },
  );
})();
