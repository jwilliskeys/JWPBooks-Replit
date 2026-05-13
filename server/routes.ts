import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableGoogleSheetClient, SPREADSHEET_ID } from "./googleSheets";
import { insertCustomerSchema, insertPianoSchema, insertServiceRecordSchema, insertAppointmentSchema, insertCalendarNoteSchema, insertCalendarEventSchema, insertTripSchema, insertTripAppointmentSchema, insertInvoiceSchema, insertServiceCatalogSchema, insertServiceGroupSchema, insertCustomerContactSchema } from "@shared/schema";
import { isAuthenticated } from "./simpleAuth";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads", "pianos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
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

function getUserId(req: any): string {
  return req.session?.userId as string;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", (req, res, next) => {
    if (req.path === "/login" || req.path === "/logout" || req.path === "/auth/user") {
      return next();
    }
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

  app.post("/api/pianos/:id/photos", upload.array("photos", 10), async (req, res) => {
    try {
      const userId = getUserId(req);
      const pianoId = parseInt(req.params.id as string);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
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
      const userId = getUserId(req);
      const pianoId = parseInt(req.params.pianoId);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
      const owner = await storage.getCustomer(piano.customerId);
      if (!owner || owner.userId !== userId) return res.status(403).json({ message: "Forbidden" });
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

  app.use("/uploads", (await import("express")).default.static(path.join(process.cwd(), "uploads")));

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
      res.json({ success: true });
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
        updatedAt: null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { zelleHandle, paypalMe, venmoHandle, cashAppHandle, stripePaymentLink } = req.body;
      const settings = await storage.upsertUserSettings(userId, {
        zelleHandle: zelleHandle ?? null,
        paypalMe: paypalMe ?? null,
        venmoHandle: venmoHandle ?? null,
        cashAppHandle: cashAppHandle ?? null,
        stripePaymentLink: stripePaymentLink ?? null,
      });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
