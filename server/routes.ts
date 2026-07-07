import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableGoogleSheetClient, SPREADSHEET_ID } from "./googleSheets";
import { insertCustomerSchema, insertPianoSchema, insertServiceRecordSchema, insertAppointmentSchema, insertCalendarNoteSchema, insertCalendarEventSchema, insertTripSchema, insertTripAppointmentSchema, insertInvoiceSchema, insertServiceCatalogSchema, insertServiceGroupSchema, insertCustomerContactSchema, insertMileageLogSchema, insertBusinessExpenseSchema, insertOutreachLeadSchema, insertInspectionSchema, insertBankAccountSchema, insertBankTransactionSchema, publicBookingRequestSchema } from "@shared/schema";
import { isAuthenticated } from "./simpleAuth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseDeltaFlightPdf } from "./parsePdf";

const uploadDir = path.join(process.cwd(), "uploads", "pianos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const expenseUploadDir = path.join(process.cwd(), "uploads", "expenses");
if (!fs.existsSync(expenseUploadDir)) {
  fs.mkdirSync(expenseUploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
    filename: (_req: any, file: any, cb: any) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|heic|heif|avif|tiff|bmp)$/i;
    // also accept by mimetype for HEIC files that some browsers report differently
    const allowedMime = /^image\//i;
    cb(null, allowed.test(path.extname(file.originalname)) || allowedMime.test(file.mimetype));
  },
});

const expenseUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, expenseUploadDir),
    filename: (_req: any, file: any, cb: any) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

// In-memory multer for flight PDF parsing (no disk storage needed)
const flightUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    cb(null, /\.pdf$/i.test(path.extname(file.originalname)));
  },
});

function getUserId(req: any): string {
  return req.session?.userId as string;
}

function parseMoney(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Auto-generates a draft invoice from a just-completed appointment. Prefers the
// itemized services actually picked in the Complete Appointment dialog (per-piano
// services + misc services, each with its own catalog price and quantity) — the
// same data that gets written to serviceRecords. Falls back to splitting the
// appointment's free-text `servicesRequested` against the catalog, and finally to
// the appointment's priceEstimate, if completion didn't itemize anything (e.g. a
// quick "mark complete" with no service picks). No-ops (returns the existing
// invoice) if one is already linked to this appointment, so re-completing an
// appointment never creates duplicates.
async function autoCreateInvoiceForAppointment(
  appointment: {
    id: number;
    customerId: number;
    pianoId: number | null;
    servicesRequested: string | null;
    priceEstimate: string | null;
  },
  userId: string,
  pianoRecords: Array<{ pianoId: number | null; services?: string }>,
  miscServicesRaw: string,
) {
  const existingInvoice = await storage.getInvoiceByAppointmentId(appointment.id);
  if (existingInvoice) return existingInvoice;

  const customer = await storage.getCustomer(appointment.customerId);
  if (!customer) return null;

  const piano = appointment.pianoId ? await storage.getPiano(appointment.pianoId) : undefined;

  type SelectedSvc = { name?: string; price?: string; quantity?: number };
  const lineItems: Array<{ description: string; quantity: number; unitPrice: number }> = [];

  for (const rec of pianoRecords) {
    let services: SelectedSvc[] = [];
    try { services = JSON.parse(rec.services || "[]"); } catch { services = []; }
    for (const s of services) {
      if (!s?.name) continue;
      lineItems.push({ description: s.name, quantity: s.quantity || 1, unitPrice: parseMoney(s.price) });
    }
  }

  let misc: SelectedSvc[] = [];
  try { misc = JSON.parse(miscServicesRaw || "[]"); } catch { misc = []; }
  for (const s of misc) {
    if (!s?.name) continue;
    lineItems.push({ description: s.name, quantity: s.quantity || 1, unitPrice: parseMoney(s.price) });
  }

  if (lineItems.length === 0) {
    const serviceNames = (appointment.servicesRequested || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (serviceNames.length > 0) {
      const catalog = await storage.getServiceCatalog(userId);
      for (const name of serviceNames) {
        const match = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
        lineItems.push({ description: name, quantity: 1, unitPrice: match ? parseMoney(match.defaultCost) : 0 });
      }
      const catalogTotal = lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0);
      if (catalogTotal === 0) {
        const estimate = parseMoney(appointment.priceEstimate);
        if (estimate > 0) lineItems[0].unitPrice = estimate;
      }
    } else {
      lineItems.push({ description: "Service", quantity: 1, unitPrice: parseMoney(appointment.priceEstimate) });
    }
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0);

  const today = new Date();
  const mdyy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear() % 100}`;
  const due = new Date(today);
  due.setDate(due.getDate() + 30);

  const nextNumber = await storage.getNextInvoiceNumber(userId);
  const customerAddress = [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ");
  const pianoDescription = piano ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") : "";

  return storage.createInvoice({
    invoiceNumber: String(nextNumber),
    customerId: appointment.customerId,
    appointmentId: appointment.id,
    pianoId: appointment.pianoId ?? null,
    invoiceDate: mdyy(today),
    dueDate: mdyy(due),
    status: "draft",
    lineItems: JSON.stringify(lineItems),
    subtotal: formatMoney(subtotal),
    total: formatMoney(subtotal),
    customerName: `${customer.firstName} ${customer.lastName}`,
    customerEmail: customer.email ?? "",
    customerAddress,
    customerPhone: customer.phone ?? "",
    pianoDescription,
  }, userId);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", (req, res, next) => {
    if (req.path === "/login" || req.path === "/logout" || req.path === "/auth/user") {
      return next();
    }
    // Public endpoints: booking form, scheduler settings, and availability for the client-facing book page
    if (req.path === "/booking-requests" && req.method === "POST") return next();
    // One-tap approve link from the owner's notification email (HMAC token-protected)
    if (/^\/booking-requests\/\d+\/quick-approve$/.test(req.path) && req.method === "GET") return next();
    if (req.path === "/scheduler-settings/public" && req.method === "GET") return next();
    if (req.path === "/booking/available-slots" && req.method === "GET") return next();
    if (req.path === "/booking/services" && req.method === "GET") return next();
    // Address autocomplete for the public booking page (server-side Google key)
    if (req.path === "/places/autocomplete" && req.method === "GET") return next();
    if (req.path === "/places/details" && req.method === "GET") return next();
    return isAuthenticated(req, res, next);
  });

  app.get("/api/customers", async (req, res) => {
    try {
      const userId = getUserId(req);
      const customerList = await storage.getCustomers(userId);
      res.json(customerList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const customer = await storage.createCustomer(parsed.data, userId);
      res.status(201).json(customer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCustomer(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const updateSchema = insertCustomerSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const customer = await storage.updateCustomer(id, parsed.data);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCustomer(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const deleted = await storage.deleteCustomer(id);
      if (!deleted) return res.status(404).json({ message: "Customer not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/invoices", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const records = await storage.getInvoicesByCustomer(id, userId);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/services", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const records = await storage.getServiceRecords(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers/:id/services", async (req, res) => {
    try {
      const userId = getUserId(req);
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });

      const data = { ...req.body, customerId };
      const parsed = insertServiceRecordSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const record = await storage.createServiceRecord(parsed.data);

      if (req.body.serviceType === "tuning" && req.body.serviceDate) {
        await storage.updateCustomer(customerId, { lastTuned: req.body.serviceDate });
      }

      res.status(201).json(record);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pianos", async (req, res) => {
    try {
      const userId = getUserId(req);
      const allPianos = await storage.getAllPianos(userId);
      res.json(allPianos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/pianos", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const customerPianos = await storage.getPianos(id);
      res.json(customerPianos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers/:id/pianos", async (req, res) => {
    try {
      const userId = getUserId(req);
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const data = { ...req.body, customerId };
      const parsed = insertPianoSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const piano = await storage.createPiano(parsed.data);
      await storage.syncCustomerFromPianos(customerId);
      res.status(201).json(piano);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pianos/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(id);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      res.json({ piano, customer: owner });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pianos/:id/invoices", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(id);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const pianoInvoices = await storage.getInvoicesByPiano(id, userId);
      res.json(pianoInvoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pianos/:id/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(id);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const pianoAppointments = await storage.getAppointmentsByPiano(id, userId);
      res.json(pianoAppointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/pianos/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPiano(id);
      if (!existing) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(existing.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const updateSchema = insertPianoSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.customerId && parsed.data.customerId !== existing.customerId) {
        const newOwner = await storage.getCustomer(parsed.data.customerId);
        if (!newOwner || newOwner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const piano = await storage.updatePiano(id, parsed.data);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      await storage.syncCustomerFromPianos(existing.customerId);
      res.json(piano);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/pianos/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPiano(id);
      if (!existing) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(existing.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const deleted = await storage.deletePiano(id);
      if (!deleted) return res.status(404).json({ message: "Piano not found" });
      await storage.syncCustomerFromPianos(existing.customerId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pianos/:id/services", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(id);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const records = await storage.getServiceRecordsByPiano(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pianos/:id/services", async (req, res) => {
    try {
      const userId = getUserId(req);
      const pianoId = parseInt(req.params.id);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const data = { ...req.body, pianoId, customerId: piano.customerId };
      const parsed = insertServiceRecordSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const record = await storage.createServiceRecord(parsed.data);
      if (req.body.serviceType === "tuning" && req.body.serviceDate) {
        await storage.updatePiano(pianoId, { lastTuned: req.body.serviceDate });
        await storage.syncCustomerFromPianos(piano.customerId);
      }
      res.status(201).json(record);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/services/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getServiceRecord(id);
      if (!existing) return res.status(404).json({ message: "Service record not found" });
      const owner = await storage.getCustomer(existing.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const updateSchema = insertServiceRecordSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.customerId && parsed.data.customerId !== existing.customerId) {
        const newOwner = await storage.getCustomer(parsed.data.customerId);
        if (!newOwner || newOwner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      if (parsed.data.pianoId && parsed.data.pianoId !== existing.pianoId) {
        const newPiano = await storage.getPiano(parsed.data.pianoId);
        if (!newPiano) return res.status(404).json({ message: "Piano not found" });
        const pianoOwner = await storage.getCustomer(newPiano.customerId);
        if (!pianoOwner || pianoOwner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const record = await storage.updateServiceRecord(id, parsed.data);
      if (!record) return res.status(404).json({ message: "Service record not found" });
      const isTuning = (parsed.data.serviceType ?? existing.serviceType) === "tuning";
      const wasTuning = existing.serviceType === "tuning";
      if (isTuning || wasTuning) {
        const pianoId = record.pianoId ?? existing.pianoId;
        if (pianoId) {
          await storage.syncPianoLastTuned(pianoId);
          const piano = await storage.getPiano(pianoId);
          if (piano) await storage.syncCustomerFromPianos(piano.customerId);
        }
      }
      res.json(record);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/services/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getServiceRecord(id);
      if (!existing) return res.status(404).json({ message: "Service record not found" });
      const owner = await storage.getCustomer(existing.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const deleted = await storage.deleteServiceRecord(id);
      if (!deleted) return res.status(404).json({ message: "Service record not found" });
      if (existing.serviceType === "tuning" && existing.pianoId) {
        await storage.syncPianoLastTuned(existing.pianoId);
        const piano = await storage.getPiano(existing.pianoId);
        if (piano) await storage.syncCustomerFromPianos(piano.customerId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pianos/:id/photos", upload.array("photos", 20), async (req, res) => {
    try {
      const pianoId = parseInt(req.params.id as string);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const files = (req as any).files as any[];
      if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });
      const newPhotos = files.map((f) => `/uploads/pianos/${f.filename}`);
      const existingPhotos = piano.photos || [];
      const allPhotos = [...existingPhotos, ...newPhotos];
      const updated = await storage.updatePiano(pianoId, { photos: allPhotos });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/pianos/:pianoId/photos", async (req, res) => {
    try {
      const pianoId = parseInt(req.params.pianoId);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const { photoUrl } = req.body;
      if (!photoUrl) return res.status(400).json({ message: "No photo URL provided" });
      const updatedPhotos = (piano.photos || []).filter((p) => p !== photoUrl);
      const filePath = path.join(process.cwd(), photoUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const updated = await storage.updatePiano(pianoId, { photos: updatedPhotos });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Piano/receipt photos contain client info — require auth like the rest of the app.
  app.use("/uploads", isAuthenticated, (await import("express")).default.static(path.join(process.cwd(), "uploads")));

  // ── Inventory (stored as JSON file on disk) ────────────────────────────────
  const inventoryFilePath = path.join(process.cwd(), "data", "inventory.json");
  if (!fs.existsSync(path.join(process.cwd(), "data"))) {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  }
  if (!fs.existsSync(inventoryFilePath)) {
    fs.writeFileSync(inventoryFilePath, JSON.stringify({
      hammers: [],
      otherParts: [],
      rennerParts: [],
    }, null, 2));
  }

  app.get("/api/inventory", async (_req, res) => {
    try {
      const raw = fs.readFileSync(inventoryFilePath, "utf8");
      res.json(JSON.parse(raw));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/inventory", async (req, res) => {
    try {
      fs.writeFileSync(inventoryFilePath, JSON.stringify(req.body, null, 2));
      res.json(req.body);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const allAppointments = await storage.getAppointments(userId);
      res.json(allAppointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/appointments/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const appointment = await storage.getAppointment(id);
      if (!appointment || appointment.userId !== userId) return res.status(404).json({ message: "Appointment not found" });
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const customerAppointments = await storage.getAppointmentsByCustomer(id);
      res.json(customerAppointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const customer = await storage.getCustomer(parsed.data.customerId);
      if (!customer || customer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      if (parsed.data.pianoId) {
        const piano = await storage.getPiano(parsed.data.pianoId);
        if (!piano) return res.status(404).json({ message: "Piano not found" });
        const pianoOwner = await storage.getCustomer(piano.customerId);
        if (!pianoOwner || pianoOwner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const appointment = await storage.createAppointment(parsed.data, userId);
      res.status(201).json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getAppointment(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Appointment not found" });
      const updateSchema = insertAppointmentSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.customerId && parsed.data.customerId !== existing.customerId) {
        const newCustomer = await storage.getCustomer(parsed.data.customerId);
        if (!newCustomer || newCustomer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      if (parsed.data.pianoId && parsed.data.pianoId !== existing.pianoId) {
        const newPiano = await storage.getPiano(parsed.data.pianoId);
        if (!newPiano) return res.status(404).json({ message: "Piano not found" });
        const pianoOwner = await storage.getCustomer(newPiano.customerId);
        if (!pianoOwner || pianoOwner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const appointment = await storage.updateAppointment(id, parsed.data);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getAppointment(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Appointment not found" });
      const deleted = await storage.deleteAppointment(id);
      if (!deleted) return res.status(404).json({ message: "Appointment not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments/:id/complete", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getAppointment(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Appointment not found" });
      const { result, clientNotes, pianoRecords, miscServices, paymentMethod, paymentAmount } = req.body;
      const allowedResults = ["completed", "no-show", "cancelled"];
      const sanitizedResult = allowedResults.includes(result) ? result : "completed";
      const allowedPaymentMethods = ["Zelle", "Venmo", "CashApp", "PayPal", "Stripe", "Cash", "Check", "Other"];
      const sanitizedPaymentMethod = paymentMethod && allowedPaymentMethods.includes(paymentMethod) ? paymentMethod : null;
      const paymentNote = sanitizedPaymentMethod
        ? `Payment: ${sanitizedPaymentMethod}${paymentAmount ? ` — ${String(paymentAmount).slice(0, 50)}` : ""}`
        : null;
      const combinedNotes = [clientNotes, paymentNote].filter(Boolean).join("\n");
      const customerPianos = await storage.getPianos(existing.customerId);
      const customerPianoIds = new Set(customerPianos.map(p => p.id));
      interface PianoRecordPayload {
        pianoId: number | null | undefined;
        isTuning: boolean;
        notes: string;
        humidity: string;
        temperature: string;
        services: string;
      }
      const sanitizedPianoRecords = (Array.isArray(pianoRecords) ? pianoRecords : []).filter((rec: PianoRecordPayload) => {
        if (rec.pianoId === null || rec.pianoId === undefined) return true;
        return customerPianoIds.has(rec.pianoId);
      });
      await storage.completeAppointment(id, {
        result: sanitizedResult,
        clientNotes: combinedNotes || "",
        pianoRecords: sanitizedPianoRecords,
        miscServices: miscServices || "[]",
        appointmentDate: existing.date,
        customerId: existing.customerId,
      });

      let createdInvoice = null;
      if (sanitizedResult === "completed") {
        createdInvoice = await autoCreateInvoiceForAppointment(
          existing,
          userId,
          sanitizedPianoRecords,
          miscServices || "[]",
        );
      }

      res.json({ success: true, invoice: createdInvoice });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/service-catalog", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.seedServiceCatalog(userId);
      await storage.seedServiceGroups(userId);
      const catalog = await storage.getServiceCatalog(userId);
      res.json(catalog);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/service-groups", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.seedServiceCatalog(userId);
      await storage.seedServiceGroups(userId);
      const groups = await storage.getServiceGroups(userId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/service-groups", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertServiceGroupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const group = await storage.createServiceGroup(parsed.data, userId);
      res.status(201).json(group);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/service-groups/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertServiceGroupSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const updated = await storage.updateServiceGroup(id, userId, parsed.data);
      if (!updated) return res.status(404).json({ message: "Group not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/service-groups/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const ok = await storage.deleteServiceGroup(id, userId);
      if (!ok) return res.status(404).json({ message: "Group not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/service-catalog", async (req, res) => {
    try {
      const userId = getUserId(req);
      const catalogCreateSchema = insertServiceCatalogSchema.omit({ isDefault: true });
      const parsed = catalogCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const item = await storage.createServiceCatalogItem(parsed.data, userId);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/service-catalog/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const catalogUpdateSchema = insertServiceCatalogSchema.omit({ isDefault: true }).partial();
      const parsed = catalogUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const item = await storage.updateServiceCatalogItem(id, parsed.data, userId);
      if (!item) return res.status(404).json({ message: "Item not found" });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/service-catalog/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteServiceCatalogItem(id, userId);
      if (!deleted) return res.status(404).json({ message: "Item not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/service-catalog/:id/set-default", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const item = await storage.setDefaultService(id, userId);
      if (!item) return res.status(404).json({ message: "Item not found" });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calendar-notes", async (req, res) => {
    try {
      const userId = getUserId(req);
      const notes = await storage.getCalendarNotes(userId);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/calendar-notes", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertCalendarNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const note = await storage.createCalendarNote(parsed.data, userId);
      res.status(201).json(note);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/calendar-notes/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCalendarNote(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Note not found" });
      const updateSchema = insertCalendarNoteSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const note = await storage.updateCalendarNote(id, parsed.data);
      if (!note) return res.status(404).json({ message: "Note not found" });
      res.json(note);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/calendar-notes/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCalendarNote(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Note not found" });
      const deleted = await storage.deleteCalendarNote(id);
      if (!deleted) return res.status(404).json({ message: "Note not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calendar-events", async (req, res) => {
    try {
      const userId = getUserId(req);
      const events = await storage.getCalendarEvents(userId);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/calendar-events", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertCalendarEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const event = await storage.createCalendarEvent(parsed.data, userId);
      res.status(201).json(event);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/calendar-events/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCalendarEvent(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Event not found" });
      const updated = await storage.updateCalendarEvent(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/calendar-events/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getCalendarEvent(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Event not found" });
      const deleted = await storage.deleteCalendarEvent(id);
      if (!deleted) return res.status(404).json({ message: "Event not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trips", async (req, res) => {
    try {
      const userId = getUserId(req);
      const allTrips = await storage.getTrips(userId);
      res.json(allTrips);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trips/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const trip = await storage.getTrip(id);
      if (!trip || trip.userId !== userId) return res.status(404).json({ message: "Trip not found" });
      res.json(trip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trips", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertTripSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const trip = await storage.createTrip(parsed.data, userId);
      res.status(201).json(trip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trips/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getTrip(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Trip not found" });
      const updateSchema = insertTripSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const trip = await storage.updateTrip(id, parsed.data);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      res.json(trip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trips/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getTrip(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Trip not found" });
      const deleted = await storage.deleteTrip(id);
      if (!deleted) return res.status(404).json({ message: "Trip not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Parse a Delta flight receipt PDF and return structured flight data
  app.post("/api/parse-flight-pdf", flightUpload.single("file"), async (req, res) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "No PDF file uploaded" });
      const parsed = parseDeltaFlightPdf(file.buffer);
      // Don't send rawText to client (can be large)
      const { rawText: _raw, ...result } = parsed;
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message ?? "Failed to parse PDF" });
    }
  });

  app.get("/api/trips/:id/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const tripId = parseInt(req.params.id);
      if (isNaN(tripId)) return res.status(400).json({ message: "Invalid ID" });
      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) return res.status(404).json({ message: "Trip not found" });
      const appts = await storage.getTripAppointments(tripId);
      res.json(appts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trips/:id/appointments", async (req, res) => {
    try {
      const userId = getUserId(req);
      const tripId = parseInt(req.params.id);
      if (isNaN(tripId)) return res.status(400).json({ message: "Invalid ID" });
      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) return res.status(404).json({ message: "Trip not found" });
      const data = { ...req.body, tripId };
      const parsed = insertTripAppointmentSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.customerId) {
        const customer = await storage.getCustomer(parsed.data.customerId);
        if (!customer || customer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const appointment = await storage.createTripAppointment(parsed.data);
      res.status(201).json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trip-appointments/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getTripAppointment(id);
      if (!existing) return res.status(404).json({ message: "Trip appointment not found" });
      const trip = await storage.getTrip(existing.tripId);
      if (!trip || trip.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const updateSchema = insertTripAppointmentSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.tripId && parsed.data.tripId !== existing.tripId) {
        const newTrip = await storage.getTrip(parsed.data.tripId);
        if (!newTrip || newTrip.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      if (parsed.data.customerId && parsed.data.customerId !== existing.customerId) {
        const newCustomer = await storage.getCustomer(parsed.data.customerId);
        if (!newCustomer || newCustomer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const appointment = await storage.updateTripAppointment(id, parsed.data);
      if (!appointment) return res.status(404).json({ message: "Trip appointment not found" });
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trip-appointments/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getTripAppointment(id);
      if (!existing) return res.status(404).json({ message: "Trip appointment not found" });
      const trip = await storage.getTrip(existing.tripId);
      if (!trip || trip.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const deleted = await storage.deleteTripAppointment(id);
      if (!deleted) return res.status(404).json({ message: "Trip appointment not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/invoices/next-number", async (req, res) => {
    try {
      const userId = getUserId(req);
      const nextNum = await storage.getNextInvoiceNumber(userId);
      res.json({ nextNumber: nextNum });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/invoices", async (req, res) => {
    try {
      const userId = getUserId(req);
      const allInvoices = await storage.getInvoices(userId);
      res.json(allInvoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const invoice = await storage.getInvoice(id);
      if (!invoice || invoice.userId !== userId) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const customer = await storage.getCustomer(parsed.data.customerId);
      if (!customer || customer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      if (parsed.data.appointmentId) {
        const appt = await storage.getAppointment(parsed.data.appointmentId);
        if (!appt || appt.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const invoice = await storage.createInvoice(parsed.data, userId);
      res.status(201).json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getInvoice(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Invoice not found" });
      const updateSchema = insertInvoiceSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      if (parsed.data.customerId && parsed.data.customerId !== existing.customerId) {
        const newCustomer = await storage.getCustomer(parsed.data.customerId);
        if (!newCustomer || newCustomer.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      if (parsed.data.appointmentId && parsed.data.appointmentId !== existing.appointmentId) {
        const newAppt = await storage.getAppointment(parsed.data.appointmentId);
        if (!newAppt || newAppt.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      const invoice = await storage.updateInvoice(id, parsed.data);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getInvoice(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Invoice not found" });
      const deleted = await storage.deleteInvoice(id);
      if (!deleted) return res.status(404).json({ message: "Invoice not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mileage-logs", async (req, res) => {
    try {
      const userId = getUserId(req);
      const logs = await storage.getMileageLogs(userId);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/mileage-logs", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertMileageLogSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const log = await storage.createMileageLog(parsed.data, userId);
      res.status(201).json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/mileage-logs/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const log = await storage.getMileageLog(id, userId);
      if (!log) return res.status(404).json({ message: "Not found" });
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/mileage-logs/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertMileageLogSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const log = await storage.updateMileageLog(id, userId, parsed.data);
      if (!log) return res.status(404).json({ message: "Not found" });
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/mileage-logs/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteMileageLog(id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/business-expenses", async (req, res) => {
    try {
      const userId = getUserId(req);
      const expenses = await storage.getBusinessExpenses(userId);
      res.json(expenses);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/business-expenses", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertBusinessExpenseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const expense = await storage.createBusinessExpense(parsed.data, userId);
      res.status(201).json(expense);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/business-expenses/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const expense = await storage.getBusinessExpense(id, userId);
      if (!expense) return res.status(404).json({ message: "Not found" });
      res.json(expense);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/business-expenses/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertBusinessExpenseSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const expense = await storage.updateBusinessExpense(id, userId, parsed.data);
      if (!expense) return res.status(404).json({ message: "Not found" });
      res.json(expense);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/business-expenses/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteBusinessExpense(id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Outreach Leads (Call-Center) ─────────────────────────────────────────
  app.get("/api/outreach-leads", async (req, res) => {
    try {
      const userId = getUserId(req);
      const leads = await storage.getOutreachLeads(userId);
      res.json(leads);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/outreach-leads", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertOutreachLeadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const lead = await storage.createOutreachLead(parsed.data, userId);
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Geocodes every lead that's missing lat/lng so it can appear on the map view.
  // Registered before "/:id" so the path isn't swallowed by the param route.
  app.post("/api/outreach-leads/geocode-missing", async (req, res) => {
    try {
      const userId = getUserId(req);
      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) return res.status(503).json({ message: "GOOGLE_MAPS_API_KEY not configured" });
      const leads = await storage.getOutreachLeads(userId);
      const missing = leads.filter((l) => !l.lat || !l.lng);
      let geocoded = 0;
      let failed = 0;
      for (const lead of missing) {
        const q = [lead.name, lead.address, lead.city, "MA"].filter(Boolean).join(", ");
        try {
          const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
          url.searchParams.set("address", q);
          url.searchParams.set("key", key);
          const resp = await fetch(url.toString());
          const data = (await resp.json()) as any;
          const loc = data?.results?.[0]?.geometry?.location;
          if (loc) {
            await storage.updateOutreachLead(lead.id, userId, { lat: String(loc.lat), lng: String(loc.lng) });
            geocoded++;
          } else {
            failed++;
          }
          await new Promise((r) => setTimeout(r, 60)); // gentle rate limit
        } catch {
          failed++;
        }
      }
      res.json({ geocoded, failed, remaining: failed });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/outreach-leads/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const lead = await storage.getOutreachLead(id, userId);
      if (!lead) return res.status(404).json({ message: "Not found" });
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/outreach-leads/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertOutreachLeadSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const lead = await storage.updateOutreachLead(id, userId, parsed.data);
      if (!lead) return res.status(404).json({ message: "Not found" });
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/outreach-leads/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteOutreachLead(id, userId);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/business-expenses/:id/receipt", expenseUpload.single("receipt"), async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const expense = await storage.getBusinessExpense(id, userId);
      if (!expense) return res.status(404).json({ message: "Expense not found" });
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const receiptUrl = `/uploads/expenses/${file.filename}`;
      const updated = await storage.updateBusinessExpense(id, userId, { receiptUrl });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const userId = getUserId(req);
      const sheets = await getUncachableGoogleSheetClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "A1:L1000",
      });

      const rows = result.data.values;
      if (!rows || rows.length < 2) {
        return res.json({ imported: 0, updated: 0, total: 0 });
      }

      const headers = rows[0].map((h: string) => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      const colMap: Record<string, string> = {
        "first": "firstName",
        "last": "lastName",
        "company name": "companyName",
        "email": "email",
        "phone": "phone",
        "address": "address",
        "city": "city",
        "state": "state",
        "zip code": "zipCode",
        "piano": "pianoType",
        "last tuned": "lastTuned",
        "personal notes": "personalNotes",
      };

      const headerIndices: Record<string, number> = {};
      headers.forEach((h: string, i: number) => {
        if (colMap[h]) {
          headerIndices[colMap[h]] = i;
        }
      });

      let imported = 0;
      let updated = 0;

      for (const row of dataRows) {
        const getVal = (field: string) => {
          const idx = headerIndices[field];
          return idx !== undefined ? (row[idx] || "").trim() || null : null;
        };

        const firstName = getVal("firstName") || "";
        const lastName = getVal("lastName") || "";
        if (!firstName && !lastName) continue;

        const customerData = {
          firstName,
          lastName,
          companyName: getVal("companyName"),
          email: getVal("email"),
          phone: getVal("phone"),
          address: getVal("address"),
          city: getVal("city"),
          state: getVal("state"),
          zipCode: getVal("zipCode"),
          pianoType: getVal("pianoType"),
          lastTuned: getVal("lastTuned"),
          personalNotes: getVal("personalNotes"),
        };

        const existing = await storage.findCustomerByName(firstName, lastName, userId);

        if (existing) {
          await storage.updateCustomer(existing.id, customerData);
          updated++;
        } else {
          await storage.createCustomer(customerData, userId);
          imported++;
        }
      }

      res.json({ imported, updated, total: dataRows.length });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/driving-times", async (req, res) => {
    const { addresses } = req.body as { addresses: string[] };
    if (!addresses || addresses.length < 2) {
      return res.json({ durations: [], distances: [] });
    }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.json({ durations: null, distances: null, error: "Google Maps API key not configured" });
    }
    try {
      const origins = addresses.slice(0, -1);
      const destinations = addresses.slice(1);
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", origins.join("|"));
      url.searchParams.set("destinations", destinations.join("|"));
      url.searchParams.set("mode", "driving");
      url.searchParams.set("key", apiKey);
      const response = await fetch(url.toString());
      const data = (await response.json()) as any;
      if (data.status !== "OK") {
        return res.json({ durations: null, distances: null, error: `Maps API error: ${data.status}` });
      }
      const durations: number[] = [];
      const distances: number[] = [];
      for (let i = 0; i < origins.length; i++) {
        const element = data.rows[i]?.elements[i];
        const ok = element?.status === "OK";
        durations.push(ok ? Math.ceil(element.duration.value / 60) : -1);
        distances.push(ok && element.distance?.value != null ? Math.round((element.distance.value / 1609.344) * 10) / 10 : -1);
      }
      res.json({ durations, distances });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/customers/:id/contacts", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const contacts = await storage.getCustomerContacts(id);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers/:id/contacts", async (req, res) => {
    try {
      const userId = getUserId(req);
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const parsed = insertCustomerContactSchema.safeParse({ ...req.body, customerId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const contact = await storage.createCustomerContact(parsed.data, userId);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/customer-contacts/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const contact = await storage.getCustomerContact(id);
      if (!contact || contact.userId !== userId) return res.status(404).json({ message: "Contact not found" });
      const parsed = insertCustomerContactSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const updated = await storage.updateCustomerContact(id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Contact not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customer-contacts/:id/set-primary", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const contact = await storage.getCustomerContact(id);
      if (!contact || contact.userId !== userId) return res.status(404).json({ message: "Contact not found" });
      const customerId = contact.customerId;
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.userId !== userId) return res.status(404).json({ message: "Customer not found" });
      const updated = await storage.setPrimaryContact(id, customerId);
      if (!updated) return res.status(404).json({ message: "Contact not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/customer-contacts/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const contact = await storage.getCustomerContact(id);
      if (!contact || contact.userId !== userId) return res.status(404).json({ message: "Contact not found" });
      const deleted = await storage.deleteCustomerContact(id);
      if (!deleted) return res.status(404).json({ message: "Contact not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Google Places (server-side proxy) ───────────────────────────────────────
  // Uses Places API (New) — the legacy Places web service is not enabled for
  // API keys created after March 2025 and returns REQUEST_DENIED.
  // GOOGLE_MAPS_API_KEY is read at request time so a missing key is handled
  // gracefully — predictions just return an empty array.
  // The optional `sessiontoken` query param (minted client-side per typing
  // session) is forwarded to Google so autocomplete + the matching details
  // call bill at the cheaper per-session rate.

  app.get("/api/places/autocomplete", async (req, res) => {
    try {
      const input = (req.query.input as string | undefined) ?? "";
      if (input.length < 3) return res.json({ predictions: [] });

      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) {
        console.warn("GOOGLE_MAPS_API_KEY is not set — autocomplete disabled");
        return res.json({ predictions: [] });
      }

      const sessionToken = (req.query.sessiontoken as string | undefined) || undefined;
      const body: Record<string, unknown> = {
        input,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      };
      if (sessionToken) body.sessionToken = sessionToken;

      const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
        error?: { status?: string; message?: string };
      };

      if (!resp.ok || data.error) {
        console.error(
          "Places autocomplete (New) error:",
          data.error?.status ?? resp.status,
          data.error?.message ?? "",
        );
        return res.json({ predictions: [] });
      }

      const predictions = (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
        .map((p) => ({
          place_id: p.placeId as string,
          description: p.text?.text ?? "",
          mainText: p.structuredFormat?.mainText?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        }));

      return res.json({ predictions });
    } catch (err: any) {
      console.error("Places autocomplete fetch failed:", err);
      return res.json({ predictions: [] });
    }
  });

  app.get("/api/places/details", async (req, res) => {
    try {
      const placeId = (req.query.place_id as string | undefined) ?? "";
      if (!placeId) return res.status(400).json({ error: "place_id required" });

      const key = process.env.GOOGLE_MAPS_API_KEY;
      if (!key) {
        console.warn("GOOGLE_MAPS_API_KEY is not set — details disabled");
        return res.status(500).json({ error: "API key not configured" });
      }

      const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
      const sessionToken = (req.query.sessiontoken as string | undefined) || undefined;
      if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

      const resp = await fetch(url.toString(), {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "addressComponents,formattedAddress,location",
        },
      });
      const data = (await resp.json()) as {
        addressComponents?: Array<{ types?: string[]; longText?: string; shortText?: string }>;
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        error?: { status?: string; message?: string };
      };

      if (!resp.ok || data.error) {
        console.error(
          "Places details (New) error:",
          data.error?.status ?? resp.status,
          data.error?.message ?? "",
        );
        return res.status(400).json({ error: data.error?.status ?? "Unknown error" });
      }

      const comps = data.addressComponents ?? [];
      const pick = (type: string, short = false): string => {
        const c = comps.find((c) => (c.types ?? []).includes(type));
        return c ? (short ? c.shortText ?? "" : c.longText ?? "") : "";
      };

      const streetNumber = pick("street_number");
      const route = pick("route");
      const street = [streetNumber, route].filter(Boolean).join(" ");
      const city =
        pick("locality") || pick("sublocality") || pick("neighborhood");
      const state = pick("administrative_area_level_1", true);
      const zipCode = pick("postal_code");
      const loc = data.location;

      return res.json({
        street,
        city,
        state,
        zipCode,
        formattedAddress: data.formattedAddress ?? "",
        lat: loc?.latitude != null ? String(loc.latitude) : "",
        lng: loc?.longitude != null ? String(loc.longitude) : "",
      });
    } catch (err: any) {
      console.error("Places details fetch failed:", err);
      return res.status(500).json({ error: "Fetch failed" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.getUserSettings(userId);
      res.json(settings ?? {
        userId,
        zelleHandle: null,
        paypalMe: null,
        venmoHandle: null,
        cashAppHandle: null,
        stripePaymentLink: null,
        workBlockExceptions: null,
        updatedAt: null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { zelleHandle, paypalMe, venmoHandle, cashAppHandle, stripePaymentLink, workBlockExceptions } = req.body;
      const settings = await storage.upsertUserSettings(userId, {
        zelleHandle: zelleHandle ?? null,
        paypalMe: paypalMe ?? null,
        venmoHandle: venmoHandle ?? null,
        cashAppHandle: cashAppHandle ?? null,
        stripePaymentLink: stripePaymentLink ?? null,
        // Only update workBlockExceptions if it was explicitly sent in the request body
        ...(workBlockExceptions !== undefined ? { workBlockExceptions } : {}),
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Public Booking API ────────────────────────────────────────────────────

  /**
   * GET /api/booking/services
   * Returns the client-facing service list for the public booking form.
   * Deliberately a fixed list (per Willis) — the service_groups table holds
   * internal category names (Field Service, Institutional, …) that aren't
   * meaningful to customers.
   */
  const PUBLIC_BOOKING_SERVICES = [
    "Standard Tuning",
    "Major Tuning (Pitch Correction)",
    "Cleaning",
    "Repairs",
    "Regulation",
    "Voicing",
    "Inspection",
  ];
  app.get("/api/booking/services", async (_req, res) => {
    res.json({ services: PUBLIC_BOOKING_SERVICES });
  });

  /**
   * Shared booking-availability engine.
   *
   * All dates are formatted with toLocalYMD (local components) — NEVER
   * toISOString(), which converts to UTC and can shift the calendar day.
   * Slots are generated from scheduler_settings (per-weekday hours, duration,
   * buffer, max/week, horizon) with sensible defaults, and every slot is
   * conflict-checked against existing appointments AND pending (held)
   * booking requests so a taken time is never offered twice.
   */
  // Utah trip days offer these fixed times (flight-day exclusions handled in
  // freeSlotsForDate — the first and last day of a trip are never bookable).
  const UTAH_TRIP_SLOTS = ["8:00 AM", "10:00 AM", "1:00 PM", "3:00 PM"];

  async function resolveOwnerUserId(): Promise<string | null> {
    const { db: drizzleDb } = await import("./db");
    const { users } = await import("@shared/schema");
    const { desc: descOp, eq: eqOp } = await import("drizzle-orm");
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      const [owner] = await drizzleDb.select({ id: users.id }).from(users).where(eqOp(users.email, ownerEmail)).limit(1);
      if (owner?.id) return owner.id;
    }
    const [fb] = await drizzleDb.select({ id: users.id }).from(users).orderBy(descOp(users.createdAt)).limit(1);
    return fb?.id ?? null;
  }

  interface BookingData {
    config: import("./booking").BookingConfig;
    todayStr: string;
    /** appointments + trip appointments + pending held requests + timed calendar events, per date */
    busyByDate: Record<string, import("./booking").BusyItem[]>;
    /** whole days blocked by all-day calendar events (conventions, travel, etc.) */
    blockedDates: Set<string>;
    /** confirmed appointments per date (for "recommended" routing) */
    apptCountByDate: Record<string, number>;
    /** Utah trip-appointment service areas per date (for same-area recommendations) */
    areasByDate: Record<string, string[]>;
    /** appointments + pending requests per ISO week (for max-per-week cap) */
    countByWeek: Record<string, number>;
    slcTrips: { name: string; startDate: string; endDate: string }[];
  }

  async function loadBookingData(ownerUserId: string): Promise<BookingData> {
    const booking = await import("./booking");
    const { db: drizzleDb } = await import("./db");
    const { appointments, trips, tripAppointments, bookingRequests, calendarEvents } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const settings = await storage.getSchedulerSettings(ownerUserId);
    const config = booking.resolveBookingConfig(settings);
    const todayStr = booking.toLocalYMD(new Date());

    const existingAppts = await drizzleDb
      .select({ date: appointments.date, time: appointments.time, duration: appointments.duration, status: appointments.status })
      .from(appointments)
      .where(eqOp(appointments.userId, ownerUserId));

    const pendingReqs = await drizzleDb
      .select({ requestedDate: bookingRequests.requestedDate, requestedTime: bookingRequests.requestedTime, status: bookingRequests.status })
      .from(bookingRequests)
      .where(eqOp(bookingRequests.userId, ownerUserId));

    const busyByDate: Record<string, import("./booking").BusyItem[]> = {};
    const blockedDates = new Set<string>();
    const apptCountByDate: Record<string, number> = {};
    const areasByDate: Record<string, string[]> = {};
    const countByWeek: Record<string, number> = {};

    // NOTE: every stored date goes through normalizeDateStr — the calendar
    // saves "7/11/26" while this engine works in "2026-07-11"; comparing them
    // raw made every busy lookup miss (the July 11 double-booking bug).
    for (const a of existingAppts) {
      const date = booking.normalizeDateStr(a.date);
      if (!date || date < todayStr || a.status === "cancelled") continue;
      (busyByDate[date] ??= []).push({ time: a.time, duration: a.duration });
      apptCountByDate[date] = (apptCountByDate[date] ?? 0) + 1;
      const wk = booking.isoWeekKey(date);
      countByWeek[wk] = (countByWeek[wk] ?? 0) + 1;
    }
    // Pending requests with a chosen slot HOLD that slot until approved/declined
    for (const r of pendingReqs) {
      const date = booking.normalizeDateStr(r.requestedDate);
      if (r.status !== "pending" || !date || date < todayStr) continue;
      (busyByDate[date] ??= []).push({ time: r.requestedTime });
      const wk = booking.isoWeekKey(date);
      countByWeek[wk] = (countByWeek[wk] ?? 0) + 1;
    }

    // Trip Planner appointments (SLC itineraries) occupy their slots too, and
    // their service areas drive "recommended" days for Utah visitors.
    const tripAppts = await drizzleDb
      .select({
        date: tripAppointments.date,
        time: tripAppointments.time,
        duration: tripAppointments.duration,
        status: tripAppointments.status,
        serviceArea: tripAppointments.serviceArea,
      })
      .from(tripAppointments);
    for (const ta of tripAppts) {
      const date = booking.normalizeDateStr(ta.date);
      if (!date || date < todayStr || ta.status === "cancelled") continue;
      (busyByDate[date] ??= []).push({ time: ta.time, duration: ta.duration, area: ta.serviceArea });
      apptCountByDate[date] = (apptCountByDate[date] ?? 0) + 1;
      if (ta.serviceArea) (areasByDate[date] ??= []).push(ta.serviceArea);
    }

    // Calendar events: all-day events (incl. multi-day ranges like conventions)
    // block whole days; timed events block their interval.
    // (Repeating events only block their base date for now.)
    const events = await drizzleDb
      .select({
        date: calendarEvents.date,
        endDate: calendarEvents.endDate,
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        isAllDay: calendarEvents.isAllDay,
      })
      .from(calendarEvents)
      .where(eqOp(calendarEvents.userId, ownerUserId));
    for (const ev of events) {
      const start = booking.normalizeDateStr(ev.date);
      if (!start) continue;
      const end = booking.normalizeDateStr(ev.endDate) ?? start;
      if (end < todayStr) continue;
      if (ev.isAllDay || !ev.startTime) {
        const d = new Date(start + "T00:00:00");
        const stop = new Date(end + "T00:00:00");
        for (; d <= stop; d.setDate(d.getDate() + 1)) {
          blockedDates.add(booking.toLocalYMD(d));
        }
      } else {
        const startMins = booking.parseTimeToMinutes(ev.startTime);
        const endMins = booking.parseTimeToMinutes(ev.endTime);
        const durationLabel =
          startMins != null && endMins != null && endMins > startMins
            ? `${endMins - startMins} min`
            : null;
        (busyByDate[start] ??= []).push({ time: ev.startTime, duration: durationLabel });
      }
    }

    const allTrips = await drizzleDb.select().from(trips).where(eqOp(trips.userId, ownerUserId));
    const slcTrips = allTrips
      .filter(t => {
        const combined = `${t.name} ${t.notes ?? ""}`.toLowerCase();
        return combined.includes("slc") || combined.includes("salt lake") || combined.includes("utah");
      })
      .map(t => ({
        name: t.name,
        startDate: booking.normalizeDateStr(t.startDate) ?? "",
        endDate: booking.normalizeDateStr(t.endDate) ?? "",
      }))
      .filter(t => t.startDate && t.endDate);

    return { config, todayStr, busyByDate, blockedDates, apptCountByDate, areasByDate, countByWeek, slcTrips };
  }

  /** First/last day of a trip are travel days — never bookable (flight risk). */
  function isTripTravelDay(data: BookingData, dateStr: string): boolean {
    return data.slcTrips.some(t => dateStr === t.startDate || dateStr === t.endDate);
  }

  /** Free slot labels for one date (handles both Utah-trip days and regular days). */
  async function freeSlotsForDate(
    data: BookingData,
    dateStr: string,
    isTripDate: boolean,
    visitor?: { lat: number | null; lng: number | null },
  ): Promise<string[]> {
    const booking = await import("./booking");
    if (data.blockedDates.has(dateStr)) return [];
    const busy = booking.busyIntervalsForDate(data.busyByDate[dateStr] ?? [], data.config, visitor);
    const d = new Date(dateStr + "T00:00:00");
    const dayOfWeek = d.getDay();
    if (isTripDate) {
      if (isTripTravelDay(data, dateStr)) return [];
      return booking.filterSlotLabels(UTAH_TRIP_SLOTS, busy, data.config);
    }
    return booking.freeSlotLabels(dayOfWeek, busy, data.config);
  }

  function isWithinSlcTrip(data: BookingData, dateStr: string): boolean {
    return data.slcTrips.some(t => dateStr >= t.startDate && dateStr <= t.endDate);
  }

  app.get("/api/booking/available-slots", async (req, res) => {
    try {
      const booking = await import("./booking");
      const ownerUserId = await resolveOwnerUserId();
      if (!ownerUserId) return res.json({ availableDates: [] });

      const data = await loadBookingData(ownerUserId);

      // State detection from lat/lng bounding boxes
      const lat = parseFloat(req.query.lat as string || "0");
      const lng = parseFloat(req.query.lng as string || "0");
      const isUT = lat >= 36.99 && lat <= 42.00 && lng >= -114.05 && lng <= -109.04;
      // Visitor's city (from the address they picked) → Utah county, for
      // recommending the trip day that already has appointments in their area.
      const visitorCounty = booking.utahCountyForCity(req.query.city as string | undefined);

      type AvailableDate = {
        date: string;
        dayLabel: string;
        isRecommended: boolean;
        isTripDate: boolean;
        slots: string[];
      };

      // ── UT: return SLC trip dates (conflict-checked) ───────────────────────
      if (isUT) {
        if (data.slcTrips.length === 0) {
          return res.json({
            availableDates: [],
            isUtah: true,
            message: "No Utah trip dates are currently scheduled. Please contact John directly to request a Utah appointment.",
          });
        }

        const utahDates: AvailableDate[] = [];
        for (const trip of data.slcTrips) {
          const start = new Date(trip.startDate + "T00:00:00");
          const end = new Date(trip.endDate + "T00:00:00");
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = booking.toLocalYMD(d);
            if (dateStr < data.todayStr) continue;
            const slots = await freeSlotsForDate(data, dateStr, true, { lat, lng });
            if (slots.length === 0) continue;
            // Recommend the day whose existing appointments are in the
            // visitor's county (route clustering — John is already nearby).
            const dayCounties = (data.areasByDate[dateStr] ?? [])
              .map(a => booking.utahCountyForCity(a))
              .filter(Boolean);
            const isRecommended =
              !!visitorCounty && dayCounties.includes(visitorCounty);
            utahDates.push({
              date: dateStr,
              dayLabel: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
              isRecommended,
              isTripDate: true,
              slots,
            });
          }
        }

        if (utahDates.length === 0) {
          // Trips exist but are entirely in the past or fully booked
          return res.json({
            availableDates: [],
            isUtah: true,
            message: "No Utah trip dates are currently open for booking. Please contact John directly to request a Utah appointment.",
          });
        }

        // Name the trip the offered dates actually belong to (not a past trip)
        const currentTrip =
          data.slcTrips.find(t => t.endDate >= data.todayStr) ?? data.slcTrips[0];
        return res.json({ availableDates: utahDates, isUtah: true, tripName: currentTrip.name });
      }

      // ── MA / Other: compute from configurable working hours ────────────────
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const availableDates: AvailableDate[] = [];
      for (let dayOffset = 1; dayOffset <= data.config.bookingHorizonWeeks * 7; dayOffset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + dayOffset);
        const dateStr = booking.toLocalYMD(d);

        // Skip if this week is already at capacity (appointments + held requests)
        const weekCount = data.countByWeek[booking.isoWeekKey(dateStr)] ?? 0;
        if (weekCount >= data.config.maxPerWeek) continue;

        // John is out of town during SLC trips — no Boston-area bookings then
        if (isWithinSlcTrip(data, dateStr)) continue;

        const slots = await freeSlotsForDate(data, dateStr, false);
        if (slots.length === 0) continue;

        // "Recommended" = an appointment already exists that day
        // (route clustering: John is already in the area)
        availableDates.push({
          date: dateStr,
          dayLabel: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
          isRecommended: (data.apptCountByDate[dateStr] ?? 0) > 0,
          isTripDate: false,
          slots,
        });
      }

      res.json({ availableDates, isUtah: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Scheduler Settings ────────────────────────────────────────────────────

  // Admin: get full settings
  app.get("/api/scheduler-settings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.getSchedulerSettings(userId);
      res.json(settings ?? {
        userId,
        showServiceCost: false,
        showServiceDuration: true,
        completionRedirectUrl: null,
        serviceAreaLat: null,
        serviceAreaLng: null,
        serviceAreaRadiusMiles: "40",
        serviceAreaEnabled: false,
        welcomeMessage: null,
        reservationCompleteMessage: null,
        outsideServiceAreaMessage: null,
        privacyPolicyUrl: null,
        termsOfServiceUrl: null,
        approvalMode: "manual",
        availabilityJson: null,
        slotDurationMinutes: 90,
        slotBufferMinutes: 0,
        maxPerWeek: 2,
        bookingHorizonWeeks: 12,
        updatedAt: null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: save settings
  app.put("/api/scheduler-settings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        showServiceCost,
        showServiceDuration,
        completionRedirectUrl,
        serviceAreaLat,
        serviceAreaLng,
        serviceAreaRadiusMiles,
        serviceAreaEnabled,
        welcomeMessage,
        reservationCompleteMessage,
        outsideServiceAreaMessage,
        privacyPolicyUrl,
        termsOfServiceUrl,
        approvalMode,
        availabilityJson,
        slotDurationMinutes,
        slotBufferMinutes,
        maxPerWeek,
        bookingHorizonWeeks,
      } = req.body;
      const toInt = (v: unknown, fallback: number) => {
        const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? Math.round(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const settings = await storage.upsertSchedulerSettings(userId, {
        showServiceCost: showServiceCost ?? false,
        showServiceDuration: showServiceDuration ?? true,
        completionRedirectUrl: completionRedirectUrl ?? null,
        serviceAreaLat: serviceAreaLat ?? null,
        serviceAreaLng: serviceAreaLng ?? null,
        serviceAreaRadiusMiles: serviceAreaRadiusMiles ?? "40",
        serviceAreaEnabled: serviceAreaEnabled ?? false,
        welcomeMessage: welcomeMessage ?? null,
        reservationCompleteMessage: reservationCompleteMessage ?? null,
        outsideServiceAreaMessage: outsideServiceAreaMessage ?? null,
        privacyPolicyUrl: privacyPolicyUrl ?? null,
        termsOfServiceUrl: termsOfServiceUrl ?? null,
        approvalMode: approvalMode === "auto" ? "auto" : "manual",
        availabilityJson: typeof availabilityJson === "string" && availabilityJson.length > 0 ? availabilityJson : null,
        slotDurationMinutes: toInt(slotDurationMinutes, 90),
        slotBufferMinutes: typeof slotBufferMinutes !== "undefined" ? Math.max(0, toInt(slotBufferMinutes, 0)) : 0,
        maxPerWeek: toInt(maxPerWeek, 2),
        bookingHorizonWeeks: Math.min(52, toInt(bookingHorizonWeeks, 12)),
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public (no auth): returns only the fields the booking page needs
  app.get("/api/scheduler-settings/public", async (req, res) => {
    try {
      const { db: drizzleDb } = await import("./db");
      const { users } = await import("@shared/schema");
      const { desc: descOp } = await import("drizzle-orm");
      const ownerEmail = process.env.OWNER_EMAIL;
      let ownerUserId: string | null = null;
      if (ownerEmail) {
        const { eq: eqOp } = await import("drizzle-orm");
        const [owner] = await drizzleDb
          .select({ id: users.id })
          .from(users)
          .where(eqOp(users.email, ownerEmail))
          .limit(1);
        ownerUserId = owner?.id ?? null;
      }
      if (!ownerUserId) {
        const [fallback] = await drizzleDb
          .select({ id: users.id })
          .from(users)
          .orderBy(descOp(users.createdAt))
          .limit(1);
        ownerUserId = fallback?.id ?? null;
      }
      if (!ownerUserId) return res.json({});
      const settings = await storage.getSchedulerSettings(ownerUserId);
      // Return only public-safe fields
      res.json({
        showServiceCost: settings?.showServiceCost ?? false,
        showServiceDuration: settings?.showServiceDuration ?? true,
        serviceAreaEnabled: settings?.serviceAreaEnabled ?? false,
        serviceAreaLat: settings?.serviceAreaLat ?? null,
        serviceAreaLng: settings?.serviceAreaLng ?? null,
        serviceAreaRadiusMiles: settings?.serviceAreaRadiusMiles ?? "40",
        welcomeMessage: settings?.welcomeMessage ?? null,
        reservationCompleteMessage: settings?.reservationCompleteMessage ?? null,
        outsideServiceAreaMessage: settings?.outsideServiceAreaMessage ?? null,
        privacyPolicyUrl: settings?.privacyPolicyUrl ?? null,
        termsOfServiceUrl: settings?.termsOfServiceUrl ?? null,
        approvalMode: settings?.approvalMode === "auto" ? "auto" : "manual",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Inspections / Estimates ───────────────────────────────────────────────

  app.get("/api/inspections", async (req, res) => {
    try {
      const userId = getUserId(req);
      const list = await storage.getInspections(userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/inspections", async (req, res) => {
    try {
      const userId = getUserId(req);
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });
      const list = await storage.getInspectionsByCustomer(customerId, userId);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/inspections/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const inspection = await storage.getInspection(id, userId);
      if (!inspection) return res.status(404).json({ message: "Inspection not found" });
      res.json(inspection);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/inspections", async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertInspectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const inspection = await storage.createInspection(parsed.data, userId);
      res.status(201).json(inspection);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/inspections/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getInspection(id, userId);
      if (!existing) return res.status(404).json({ message: "Inspection not found" });
      const parsed = insertInspectionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const updated = await storage.updateInspection(id, userId, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/inspections/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteInspection(id, userId);
      if (!deleted) return res.status(404).json({ message: "Inspection not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Plaid Bank Feed ──────────────────────────────────────────────────────
  // To enable: add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV (sandbox|production)
  // to your .env file. Then run: npm run db:push (to create bank_accounts + bank_transactions tables)

  const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
  const PLAID_SECRET = process.env.PLAID_SECRET;
  const PLAID_ENV = process.env.PLAID_ENV ?? "sandbox";
  const PLAID_BASE_URL = `https://${PLAID_ENV}.plaid.com`;

  function plaidEnabled() {
    return !!(PLAID_CLIENT_ID && PLAID_SECRET);
  }

  // Create a Plaid Link token — called when user clicks "Connect Account"
  app.post("/api/plaid/link-token", async (req, res) => {
    try {
      if (!plaidEnabled()) {
        return res.status(503).json({ message: "Bank feed not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env to enable." });
      }
      const userId = getUserId(req);
      const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          client_name: "JWP Books",
          country_codes: ["US"],
          language: "en",
          user: { client_user_id: userId },
          products: ["transactions"],
        }),
      });
      const data = await response.json() as any;
      if (!response.ok) {
        return res.status(400).json({ message: data.error_message ?? "Failed to create link token" });
      }
      res.json({ link_token: data.link_token });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Exchange public token after Plaid Link completes
  app.post("/api/plaid/exchange-token", async (req, res) => {
    try {
      if (!plaidEnabled()) {
        return res.status(503).json({ message: "Bank feed not configured." });
      }
      const userId = getUserId(req);
      const { public_token, institution_name, accounts } = req.body;
      if (!public_token) return res.status(400).json({ message: "public_token required" });

      // Exchange for access token
      const exchangeRes = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, public_token }),
      });
      const exchangeData = await exchangeRes.json() as any;
      if (!exchangeRes.ok) {
        return res.status(400).json({ message: exchangeData.error_message ?? "Token exchange failed" });
      }
      const { access_token, item_id } = exchangeData;

      // Create a bank account record per selected account
      const created = [];
      for (const acct of (accounts ?? [])) {
        const bankAccount = await storage.createBankAccount({
          userId,
          plaidItemId: item_id,
          plaidAccessToken: access_token,
          institutionName: institution_name ?? null,
          accountName: acct.name ?? null,
          accountType: acct.type ?? null,
          accountMask: acct.mask ?? null,
          plaidAccountId: acct.id,
          cursor: null,
          isActive: true,
        });
        created.push(bankAccount);
      }
      res.json({ accounts: created });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get connected bank accounts
  app.get("/api/bank-accounts", async (req, res) => {
    try {
      const userId = getUserId(req);
      const accounts = await storage.getBankAccounts(userId);
      // Strip access tokens from response
      const safe = accounts.map(a => ({ ...a, plaidAccessToken: "***" }));
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Disconnect a bank account
  app.delete("/api/bank-accounts/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteBankAccount(id, userId);
      if (!deleted) return res.status(404).json({ message: "Account not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Sync transactions for all connected accounts
  app.post("/api/bank-accounts/:id/sync", async (req, res) => {
    try {
      if (!plaidEnabled()) {
        return res.status(503).json({ message: "Bank feed not configured." });
      }
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const account = await storage.getBankAccount(id, userId);
      if (!account) return res.status(404).json({ message: "Account not found" });

      // Use Plaid transactions/sync endpoint
      let cursor = account.cursor ?? undefined;
      let added: any[] = [];
      let hasMore = true;

      while (hasMore) {
        const syncRes = await fetch(`${PLAID_BASE_URL}/transactions/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: account.plaidAccessToken,
            cursor,
          }),
        });
        const syncData = await syncRes.json() as any;
        if (!syncRes.ok) {
          return res.status(400).json({ message: syncData.error_message ?? "Sync failed" });
        }
        added = [...added, ...(syncData.added ?? [])];
        cursor = syncData.next_cursor;
        hasMore = syncData.has_more;
      }

      // Save transactions
      const toInsert = added.map((t: any) => ({
        userId,
        bankAccountId: account.id,
        plaidTransactionId: t.transaction_id,
        date: t.date,
        amount: String(t.amount),
        description: t.name ?? null,
        merchantName: t.merchant_name ?? null,
        category: (t.category ?? []).join(" > ") ?? null,
        businessTag: null,
        matchedInvoiceId: null,
        schedCCategory: null,
        notes: null,
        pending: t.pending ?? false,
      }));
      await storage.upsertBankTransactions(toInsert);

      // Update cursor
      await storage.updateBankAccount(id, userId, { cursor: cursor ?? null });

      res.json({ synced: added.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get transactions for review queue
  app.get("/api/bank-transactions", async (req, res) => {
    try {
      const userId = getUserId(req);
      const transactions = await storage.getBankTransactions(userId);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tag transaction as business/personal, assign Schedule C category, match invoice
  app.patch("/api/bank-transactions/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { businessTag, schedCCategory, matchedInvoiceId, notes } = req.body;
      const updated = await storage.updateBankTransaction(id, userId, {
        businessTag: businessTag ?? undefined,
        schedCCategory: schedCCategory ?? undefined,
        matchedInvoiceId: matchedInvoiceId ?? undefined,
        notes: notes ?? undefined,
      });
      if (!updated) return res.status(404).json({ message: "Transaction not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Plaid status check — tells the frontend whether bank feed is configured
  app.get("/api/plaid/status", async (req, res) => {
    res.json({
      enabled: plaidEnabled(),
      env: PLAID_ENV,
      message: plaidEnabled()
        ? `Plaid connected (${PLAID_ENV})`
        : "Add PLAID_CLIENT_ID and PLAID_SECRET to .env, then run npm run db:push to enable bank feed.",
    });
  });

  // ── Booking Requests ────────────────────────────────────────────────────────

  /** HMAC token so the owner's "Approve" email link works without a login. */
  async function quickApproveToken(requestId: number): Promise<string> {
    const { createHmac } = await import("crypto");
    const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL || "jwp-books";
    return createHmac("sha256", secret).update(`approve:${requestId}`).digest("hex");
  }

  /** Create/find customer + create appointment from a booking request (shared by all approval paths). */
  async function convertBookingRequestToAppointment(
    existing: import("@shared/schema").BookingRequest,
    userId: string,
    opts: { date: string; time: string; duration?: string; notes?: string },
  ) {
    let customer = await storage.findCustomerByName(existing.firstName, existing.lastName, userId);
    if (!customer) {
      customer = await storage.createCustomer({
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone ?? undefined,
        address: existing.streetAddress ?? undefined,
        city: existing.cityNeighborhood ?? undefined,
        pianoType: existing.pianoType ?? undefined,
        personalNotes: existing.preferredTimes
          ? `Self-scheduling request note: ${existing.preferredTimes}`
          : undefined,
      }, userId);
    }

    const appointment = await storage.createAppointment({
      customerId: customer.id,
      date: opts.date,
      time: opts.time,
      duration: opts.duration ?? "2 hours",
      isTuning: true,
      servicesRequested: existing.serviceRequested || "Standard Tuning",
      notes: opts.notes ?? `From booking request submitted by ${existing.firstName} ${existing.lastName}.`,
      status: "scheduled",
    }, userId);

    const updated = await storage.updateBookingRequest(existing.id, {
      status: "approved",
      convertedCustomerId: customer.id,
      convertedAppointmentId: appointment.id,
    });

    return { request: updated, customer, appointment };
  }

  /** Base URL of the deployed app, for links in emails. */
  function appBaseUrl(req: import("express").Request): string {
    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    return `${proto}://${req.get("host")}`;
  }

  // PUBLIC — no auth required. Called by the client-facing /book page.
  app.post("/api/booking-requests", async (req, res) => {
    try {
      const parsed = publicBookingRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      const ownerUserId = (await resolveOwnerUserId()) ?? "owner";

      // ── Conflict re-check: is the picked slot still genuinely free? ────────
      const booking = await import("./booking");
      const data = await loadBookingData(ownerUserId);
      const { requestedDate, requestedTime } = parsed.data;
      if (requestedDate && requestedTime) {
        const wantedMins = booking.parseTimeToMinutes(requestedTime);
        let conflict = "";
        if (requestedDate < data.todayStr) {
          conflict = "That date has already passed. Please pick a new date.";
        } else {
          const isTrip = isWithinSlcTrip(data, requestedDate);
          if (!isTrip) {
            const weekCount = data.countByWeek[booking.isoWeekKey(requestedDate)] ?? 0;
            if (weekCount >= data.config.maxPerWeek) {
              conflict = "That week just filled up. Please pick a date in a different week.";
            }
          }
          if (!conflict) {
            const vLat = parseFloat(parsed.data.addressLat ?? "");
            const vLng = parseFloat(parsed.data.addressLng ?? "");
            const visitor = Number.isFinite(vLat) && Number.isFinite(vLng)
              ? { lat: vLat, lng: vLng }
              : undefined;
            const free = await freeSlotsForDate(data, requestedDate, isTrip, visitor);
            const stillFree = free.some(s => booking.parseTimeToMinutes(s) === wantedMins);
            if (!stillFree) {
              conflict = "That time was just booked by someone else. Please pick a different time.";
            }
          }
        }
        if (conflict) return res.status(409).json({ message: conflict, conflict: true });
      }

      const request = await storage.createBookingRequest(parsed.data, ownerUserId);

      // ── Auto vs manual approval ────────────────────────────────────────────
      const email = await import("./email");
      const autoMode = data.config.approvalMode === "auto" && !!requestedDate && !!requestedTime;

      if (autoMode) {
        const result = await convertBookingRequestToAppointment(request, ownerUserId, {
          date: requestedDate!,
          time: requestedTime!,
        });
        // Emails (fire-and-forget — never block or fail the booking on email problems)
        const confirmed = email.clientConfirmedEmail(request);
        void email.sendEmail({ to: request.email, subject: confirmed.subject, html: confirmed.html, replyTo: process.env.OWNER_EMAIL }).catch(() => {});
        const owner = email.ownerNotificationEmail(request, "auto");
        void email.sendEmail({ to: owner.to, subject: owner.subject, html: owner.html, replyTo: request.email }).catch(() => {});
        return res.status(201).json({ ...(result.request ?? request), autoApproved: true });
      }

      // Manual mode: stays pending; notify both sides
      const received = email.clientReceivedEmail(request);
      void email.sendEmail({ to: request.email, subject: received.subject, html: received.html, replyTo: process.env.OWNER_EMAIL }).catch(() => {});
      const approveUrl = requestedDate && requestedTime
        ? `${appBaseUrl(req)}/api/booking-requests/${request.id}/quick-approve?token=${await quickApproveToken(request.id)}`
        : undefined;
      const owner = email.ownerNotificationEmail(request, "manual", approveUrl);
      void email.sendEmail({ to: owner.to, subject: owner.subject, html: owner.html, replyTo: request.email }).catch(() => {});

      res.status(201).json({ ...request, autoApproved: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC (token-protected) — one-tap approve link from the owner's email.
  app.get("/api/booking-requests/:id/quick-approve", async (req, res) => {
    const page = (title: string, body: string, ok: boolean) =>
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
      <body style="font-family:Georgia,serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1e293b;text-align:center;">
      <h2 style="color:${ok ? "#16a34a" : "#dc2626"};">${title}</h2><p style="font-size:16px;line-height:1.5;">${body}</p></body></html>`;
    try {
      const id = parseInt(req.params.id as string);
      const token = String(req.query.token ?? "");
      if (isNaN(id) || !token || token !== (await quickApproveToken(id))) {
        return res.status(403).send(page("Link not valid", "This approval link is invalid or has expired. Open your dashboard to review the request instead.", false));
      }
      const ownerUserId = await resolveOwnerUserId();
      if (!ownerUserId) return res.status(500).send(page("Something went wrong", "Could not find the owner account.", false));

      const all = await storage.getBookingRequests(ownerUserId);
      const existing = all.find(r => r.id === id);
      if (!existing) return res.status(404).send(page("Not found", "This booking request no longer exists.", false));
      if (existing.status === "approved") {
        return res.send(page("Already approved", `${existing.firstName} ${existing.lastName} is already on your calendar.`, true));
      }
      if (!existing.requestedDate || !existing.requestedTime) {
        return res.send(page("Needs a time", "This request has no specific time attached. Approve it from your dashboard where you can pick one.", false));
      }

      const result = await convertBookingRequestToAppointment(existing, ownerUserId, {
        date: existing.requestedDate,
        time: existing.requestedTime,
      });
      const email = await import("./email");
      const approved = email.clientApprovedEmail(existing, existing.requestedDate, existing.requestedTime);
      void email.sendEmail({ to: existing.email, subject: approved.subject, html: approved.html, replyTo: process.env.OWNER_EMAIL }).catch(() => {});

      res.send(page("Approved", `${existing.firstName} ${existing.lastName} is booked for ${existing.requestedDate} at ${existing.requestedTime}. They've been emailed a confirmation, and the appointment (#${result.appointment.id}) is on your calendar.`, true));
    } catch (error: any) {
      res.status(500).send(page("Something went wrong", error.message ?? "Unknown error", false));
    }
  });

  // PROTECTED — admin only
  app.get("/api/booking-requests", async (req, res) => {
    try {
      const userId = getUserId(req);
      const requests = await storage.getBookingRequests(userId);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/booking-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const updated = await storage.updateBookingRequest(id, req.body);
      if (!updated) return res.status(404).json({ message: "Booking request not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Approve: create customer + appointment, mark request approved.
  // date/time default to what the client picked on the calendar.
  app.post("/api/booking-requests/:id/approve", async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string);
      const body = req.body as { date?: string; time?: string; duration?: string; notes?: string };

      const all = await storage.getBookingRequests(userId);
      const existing = all.find(r => r.id === id);
      if (!existing) return res.status(404).json({ message: "Booking request not found" });

      const date = body.date || existing.requestedDate || "";
      const time = body.time || existing.requestedTime || "";
      if (!date || !time) {
        return res.status(400).json({ message: "date and time are required" });
      }

      const result = await convertBookingRequestToAppointment(existing, userId, {
        date,
        time,
        duration: body.duration,
        notes: body.notes,
      });

      // Email the client their confirmation (fire-and-forget)
      const email = await import("./email");
      const approved = email.clientApprovedEmail(existing, date, time);
      void email.sendEmail({ to: existing.email, subject: approved.subject, html: approved.html, replyTo: process.env.OWNER_EMAIL }).catch(() => {});

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/booking-requests/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const deleted = await storage.deleteBookingRequest(id);
      if (!deleted) return res.status(404).json({ message: "Booking request not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
