import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableGoogleSheetClient, SPREADSHEET_ID } from "./googleSheets";
import { insertCustomerSchema, insertPianoSchema, insertServiceRecordSchema, insertAppointmentSchema, insertCalendarNoteSchema, insertTripSchema, insertTripAppointmentSchema } from "@shared/schema";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/customers", async (_req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const parsed = insertCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const customer = await storage.createCustomer(parsed.data);
      res.status(201).json(customer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteCustomer(id);
      if (!deleted) return res.status(404).json({ message: "Customer not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/services", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const records = await storage.getServiceRecords(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers/:id/services", async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });

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

  app.get("/api/pianos", async (_req, res) => {
    try {
      const allPianos = await storage.getAllPianos();
      res.json(allPianos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/pianos", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customerPianos = await storage.getPianos(id);
      res.json(customerPianos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/customers/:id/pianos", async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ message: "Invalid ID" });
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

  app.patch("/api/pianos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPiano(id);
      if (!existing) return res.status(404).json({ message: "Piano not found" });
      const updateSchema = insertPianoSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getPiano(id);
      if (!existing) return res.status(404).json({ message: "Piano not found" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const records = await storage.getServiceRecordsByPiano(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pianos/:id/services", async (req, res) => {
    try {
      const pianoId = parseInt(req.params.id);
      if (isNaN(pianoId)) return res.status(400).json({ message: "Invalid ID" });
      const piano = await storage.getPiano(pianoId);
      if (!piano) return res.status(404).json({ message: "Piano not found" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getServiceRecord(id);
      if (!existing) return res.status(404).json({ message: "Service record not found" });
      const updateSchema = insertServiceRecordSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await storage.getServiceRecord(id);
      if (!existing) return res.status(404).json({ message: "Service record not found" });
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

  app.use("/uploads", (await import("express")).default.static(path.join(process.cwd(), "uploads")));

  app.get("/api/appointments", async (_req, res) => {
    try {
      const allAppointments = await storage.getAppointments();
      res.json(allAppointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/customers/:id/appointments", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const customerAppointments = await storage.getAppointmentsByCustomer(id);
      res.json(customerAppointments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const parsed = insertAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const appointment = await storage.createAppointment(parsed.data);
      res.status(201).json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const updateSchema = insertAppointmentSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteAppointment(id);
      if (!deleted) return res.status(404).json({ message: "Appointment not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/calendar-notes", async (_req, res) => {
    try {
      const notes = await storage.getCalendarNotes();
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/calendar-notes", async (req, res) => {
    try {
      const parsed = insertCalendarNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const note = await storage.createCalendarNote(parsed.data);
      res.status(201).json(note);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/calendar-notes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteCalendarNote(id);
      if (!deleted) return res.status(404).json({ message: "Note not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trips", async (_req, res) => {
    try {
      const allTrips = await storage.getTrips();
      res.json(allTrips);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const trip = await storage.getTrip(id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      res.json(trip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trips", async (req, res) => {
    try {
      const parsed = insertTripSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const trip = await storage.createTrip(parsed.data);
      res.status(201).json(trip);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteTrip(id);
      if (!deleted) return res.status(404).json({ message: "Trip not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trips/:id/appointments", async (req, res) => {
    try {
      const tripId = parseInt(req.params.id);
      if (isNaN(tripId)) return res.status(400).json({ message: "Invalid ID" });
      const appts = await storage.getTripAppointments(tripId);
      res.json(appts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trips/:id/appointments", async (req, res) => {
    try {
      const tripId = parseInt(req.params.id);
      if (isNaN(tripId)) return res.status(400).json({ message: "Invalid ID" });
      const data = { ...req.body, tripId };
      const parsed = insertTripAppointmentSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const appointment = await storage.createTripAppointment(parsed.data);
      res.status(201).json(appointment);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trip-appointments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const updateSchema = insertTripAppointmentSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await storage.deleteTripAppointment(id);
      if (!deleted) return res.status(404).json({ message: "Trip appointment not found" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sync", async (_req, res) => {
    try {
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

        const existing = await storage.findCustomerByName(firstName, lastName);

        if (existing) {
          await storage.updateCustomer(existing.id, customerData);
          updated++;
        } else {
          await storage.createCustomer(customerData);
          imported++;
        }
      }

      res.json({ imported, updated, total: dataRows.length });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
