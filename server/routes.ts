import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableGoogleSheetClient, SPREADSHEET_ID } from "./googleSheets";
import { insertCustomerSchema, insertServiceRecordSchema } from "@shared/schema";

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
