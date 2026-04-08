import { db } from "./db";
import { eq, and, isNull, asc } from "drizzle-orm";
import {
  customers,
  pianos,
  serviceRecords,
  appointments,
  calendarNotes,
  calendarEvents,
  trips,
  tripAppointments,
  invoices,
  serviceCatalog,
  type Customer,
  type InsertCustomer,
  type Piano,
  type InsertPiano,
  type ServiceRecord,
  type InsertServiceRecord,
  type Appointment,
  type InsertAppointment,
  type CalendarNote,
  type InsertCalendarNote,
  type CalendarEvent,
  type InsertCalendarEvent,
  type Trip,
  type InsertTrip,
  type TripAppointment,
  type InsertTripAppointment,
  type Invoice,
  type InsertInvoice,
  type ServiceCatalogItem,
  type InsertServiceCatalogItem,
} from "@shared/schema";

export interface IStorage {
  getCustomers(userId: string): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer, userId: string): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  findCustomerByName(firstName: string, lastName: string, userId: string): Promise<Customer | undefined>;
  getPianos(customerId: number): Promise<Piano[]>;
  getPiano(id: number): Promise<Piano | undefined>;
  createPiano(piano: InsertPiano): Promise<Piano>;
  updatePiano(id: number, data: Partial<InsertPiano>): Promise<Piano | undefined>;
  deletePiano(id: number): Promise<boolean>;
  getAllPianos(userId: string): Promise<Piano[]>;
  getServiceRecords(customerId: number): Promise<ServiceRecord[]>;
  getServiceRecordsByPiano(pianoId: number): Promise<ServiceRecord[]>;
  createServiceRecord(record: InsertServiceRecord): Promise<ServiceRecord>;
  getServiceRecord(id: number): Promise<ServiceRecord | undefined>;
  updateServiceRecord(id: number, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;
  deleteServiceRecord(id: number): Promise<boolean>;
  syncPianoLastTuned(pianoId: number): Promise<void>;
  getAppointments(userId: string): Promise<Appointment[]>;
  getAppointmentsByCustomer(customerId: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment, userId: string): Promise<Appointment>;
  updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<boolean>;
  getCalendarNotes(userId: string): Promise<CalendarNote[]>;
  getCalendarNote(id: number): Promise<CalendarNote | undefined>;
  createCalendarNote(note: InsertCalendarNote, userId: string): Promise<CalendarNote>;
  updateCalendarNote(id: number, data: Partial<InsertCalendarNote>): Promise<CalendarNote | undefined>;
  deleteCalendarNote(id: number): Promise<boolean>;
  getCalendarEvents(userId: string): Promise<CalendarEvent[]>;
  getCalendarEvent(id: number): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent, userId: string): Promise<CalendarEvent>;
  deleteCalendarEvent(id: number): Promise<boolean>;
  getTrips(userId: string): Promise<Trip[]>;
  getTrip(id: number): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip, userId: string): Promise<Trip>;
  updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number): Promise<boolean>;
  getTripAppointments(tripId: number): Promise<TripAppointment[]>;
  getTripAppointment(id: number): Promise<TripAppointment | undefined>;
  createTripAppointment(appointment: InsertTripAppointment): Promise<TripAppointment>;
  updateTripAppointment(id: number, data: Partial<InsertTripAppointment>): Promise<TripAppointment | undefined>;
  deleteTripAppointment(id: number): Promise<boolean>;
  getInvoices(userId: string): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice, userId: string): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<boolean>;
  getNextInvoiceNumber(userId: string): Promise<number>;
  getServiceCatalog(): Promise<ServiceCatalogItem[]>;
  createServiceCatalogItem(item: InsertServiceCatalogItem): Promise<ServiceCatalogItem>;
  updateServiceCatalogItem(id: number, data: Partial<InsertServiceCatalogItem>): Promise<ServiceCatalogItem | undefined>;
  deleteServiceCatalogItem(id: number): Promise<boolean>;
  seedServiceCatalogIfEmpty(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(userId: string): Promise<Customer[]> {
    return db.select().from(customers).where(eq(customers.userId, userId)).orderBy(customers.lastName);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer, userId: string): Promise<Customer> {
    const [created] = await db.insert(customers).values({ ...customer, userId }).returning();
    return created;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db
      .update(customers)
      .set(data)
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    const customerPianos = await db.select().from(pianos).where(eq(pianos.customerId, id));
    for (const piano of customerPianos) {
      await db.delete(serviceRecords).where(eq(serviceRecords.pianoId, piano.id));
    }
    await db.delete(serviceRecords).where(eq(serviceRecords.customerId, id));
    await db.delete(pianos).where(eq(pianos.customerId, id));
    const result = await db.delete(customers).where(eq(customers.id, id)).returning();
    return result.length > 0;
  }

  async findCustomerByName(firstName: string, lastName: string, userId: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.firstName, firstName), eq(customers.lastName, lastName), eq(customers.userId, userId)));
    return customer;
  }

  async getPianos(customerId: number): Promise<Piano[]> {
    return db.select().from(pianos).where(eq(pianos.customerId, customerId)).orderBy(pianos.createdAt);
  }

  async getPiano(id: number): Promise<Piano | undefined> {
    const [piano] = await db.select().from(pianos).where(eq(pianos.id, id));
    return piano;
  }

  async createPiano(piano: InsertPiano): Promise<Piano> {
    const [created] = await db.insert(pianos).values(piano).returning();
    return created;
  }

  async updatePiano(id: number, data: Partial<InsertPiano>): Promise<Piano | undefined> {
    const [updated] = await db
      .update(pianos)
      .set(data)
      .where(eq(pianos.id, id))
      .returning();
    return updated;
  }

  async deletePiano(id: number): Promise<boolean> {
    await db.delete(serviceRecords).where(eq(serviceRecords.pianoId, id));
    const result = await db.delete(pianos).where(eq(pianos.id, id)).returning();
    return result.length > 0;
  }

  async getAllPianos(userId: string): Promise<Piano[]> {
    const results = await db
      .select({ piano: pianos })
      .from(pianos)
      .innerJoin(customers, and(eq(pianos.customerId, customers.id), eq(customers.userId, userId)))
      .orderBy(pianos.createdAt);
    return results.map(r => r.piano);
  }

  async getServiceRecords(customerId: number): Promise<ServiceRecord[]> {
    return db
      .select()
      .from(serviceRecords)
      .where(eq(serviceRecords.customerId, customerId))
      .orderBy(serviceRecords.createdAt);
  }

  async getServiceRecordsByPiano(pianoId: number): Promise<ServiceRecord[]> {
    return db
      .select()
      .from(serviceRecords)
      .where(eq(serviceRecords.pianoId, pianoId))
      .orderBy(serviceRecords.createdAt);
  }

  async createServiceRecord(record: InsertServiceRecord): Promise<ServiceRecord> {
    const [created] = await db.insert(serviceRecords).values(record).returning();
    return created;
  }

  async getServiceRecord(id: number): Promise<ServiceRecord | undefined> {
    const [record] = await db.select().from(serviceRecords).where(eq(serviceRecords.id, id));
    return record;
  }

  async updateServiceRecord(id: number, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined> {
    const [updated] = await db
      .update(serviceRecords)
      .set(data)
      .where(eq(serviceRecords.id, id))
      .returning();
    return updated;
  }

  async deleteServiceRecord(id: number): Promise<boolean> {
    const result = await db.delete(serviceRecords).where(eq(serviceRecords.id, id)).returning();
    return result.length > 0;
  }

  async getAppointments(userId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.userId, userId)).orderBy(appointments.date);
  }

  async getAppointmentsByCustomer(customerId: number): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.customerId, customerId)).orderBy(appointments.date);
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment, userId: string): Promise<Appointment> {
    const [created] = await db.insert(appointments).values({ ...appointment, userId }).returning();
    return created;
  }

  async updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db.update(appointments).set(data).where(eq(appointments.id, id)).returning();
    return updated;
  }

  async deleteAppointment(id: number): Promise<boolean> {
    const result = await db.delete(appointments).where(eq(appointments.id, id)).returning();
    return result.length > 0;
  }

  async syncPianoLastTuned(pianoId: number): Promise<void> {
    const records = await this.getServiceRecordsByPiano(pianoId);
    const tuningRecords = records.filter(r => r.serviceType === "tuning");
    let mostRecentDate: Date | null = null;
    let mostRecentStr: string | null = null;
    for (const r of tuningRecords) {
      if (!r.serviceDate) continue;
      const parts = r.serviceDate.split("/");
      if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
        if (!mostRecentDate || d > mostRecentDate) {
          mostRecentDate = d;
          mostRecentStr = r.serviceDate;
        }
      }
    }
    await this.updatePiano(pianoId, { lastTuned: mostRecentStr });
  }

  async getCalendarNotes(userId: string): Promise<CalendarNote[]> {
    return db.select().from(calendarNotes).where(eq(calendarNotes.userId, userId)).orderBy(calendarNotes.date);
  }

  async getCalendarNote(id: number): Promise<CalendarNote | undefined> {
    const [note] = await db.select().from(calendarNotes).where(eq(calendarNotes.id, id));
    return note;
  }

  async createCalendarNote(note: InsertCalendarNote, userId: string): Promise<CalendarNote> {
    const [created] = await db.insert(calendarNotes).values({ ...note, userId }).returning();
    return created;
  }

  async updateCalendarNote(id: number, data: Partial<InsertCalendarNote>): Promise<CalendarNote | undefined> {
    const [updated] = await db.update(calendarNotes).set(data).where(eq(calendarNotes.id, id)).returning();
    return updated;
  }

  async deleteCalendarNote(id: number): Promise<boolean> {
    const result = await db.delete(calendarNotes).where(eq(calendarNotes.id, id)).returning();
    return result.length > 0;
  }

  async getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
    return db.select().from(calendarEvents).where(eq(calendarEvents.userId, userId)).orderBy(calendarEvents.date);
  }

  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return event;
  }

  async createCalendarEvent(event: InsertCalendarEvent, userId: string): Promise<CalendarEvent> {
    const [created] = await db.insert(calendarEvents).values({ ...event, userId }).returning();
    return created;
  }

  async deleteCalendarEvent(id: number): Promise<boolean> {
    const result = await db.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning();
    return result.length > 0;
  }

  async getTrips(userId: string): Promise<Trip[]> {
    return db.select().from(trips).where(eq(trips.userId, userId)).orderBy(trips.createdAt);
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip, userId: string): Promise<Trip> {
    const [created] = await db.insert(trips).values({ ...trip, userId }).returning();
    return created;
  }

  async updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set(data).where(eq(trips.id, id)).returning();
    return updated;
  }

  async deleteTrip(id: number): Promise<boolean> {
    await db.delete(tripAppointments).where(eq(tripAppointments.tripId, id));
    const result = await db.delete(trips).where(eq(trips.id, id)).returning();
    return result.length > 0;
  }

  async getTripAppointments(tripId: number): Promise<TripAppointment[]> {
    return db.select().from(tripAppointments).where(eq(tripAppointments.tripId, tripId)).orderBy(tripAppointments.date, tripAppointments.time);
  }

  async getTripAppointment(id: number): Promise<TripAppointment | undefined> {
    const [appt] = await db.select().from(tripAppointments).where(eq(tripAppointments.id, id));
    return appt;
  }

  async createTripAppointment(appointment: InsertTripAppointment): Promise<TripAppointment> {
    const [created] = await db.insert(tripAppointments).values(appointment).returning();
    return created;
  }

  async updateTripAppointment(id: number, data: Partial<InsertTripAppointment>): Promise<TripAppointment | undefined> {
    const [updated] = await db.update(tripAppointments).set(data).where(eq(tripAppointments.id, id)).returning();
    return updated;
  }

  async deleteTripAppointment(id: number): Promise<boolean> {
    const result = await db.delete(tripAppointments).where(eq(tripAppointments.id, id)).returning();
    return result.length > 0;
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(invoices.createdAt);
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoice: InsertInvoice, userId: string): Promise<Invoice> {
    const [created] = await db.insert(invoices).values({ ...invoice, userId }).returning();
    return created;
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async deleteInvoice(id: number): Promise<boolean> {
    const result = await db.delete(invoices).where(eq(invoices.id, id)).returning();
    return result.length > 0;
  }

  async getNextInvoiceNumber(userId: string): Promise<number> {
    const all = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.userId, userId));
    let max = 0;
    for (const row of all) {
      const n = parseInt(row.invoiceNumber, 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
  }

  async syncCustomerFromPianos(customerId: number): Promise<void> {
    const customerPianos = await this.getPianos(customerId);
    const activePianos = customerPianos.filter(p => p.isActive !== false);
    if (activePianos.length === 0) {
      await this.updateCustomer(customerId, { pianoType: null, lastTuned: null });
      return;
    }
    const pianoTypes = activePianos.map(p => [p.make, p.model, p.pianoType].filter(Boolean).join(" ")).filter(Boolean);
    const pianoType = pianoTypes.join(", ") || null;

    let mostRecentTuned: string | null = null;
    let mostRecentDate: Date | null = null;
    for (const p of activePianos) {
      if (!p.lastTuned) continue;
      const parts = p.lastTuned.split("/");
      if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
        if (!mostRecentDate || d > mostRecentDate) {
          mostRecentDate = d;
          mostRecentTuned = p.lastTuned;
        }
      }
    }
    await this.updateCustomer(customerId, { pianoType, lastTuned: mostRecentTuned });
  }

  async getServiceCatalog(): Promise<ServiceCatalogItem[]> {
    return db.select().from(serviceCatalog).orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
  }

  async createServiceCatalogItem(item: InsertServiceCatalogItem): Promise<ServiceCatalogItem> {
    const [created] = await db.insert(serviceCatalog).values(item).returning();
    return created;
  }

  async updateServiceCatalogItem(id: number, data: Partial<InsertServiceCatalogItem>): Promise<ServiceCatalogItem | undefined> {
    const [updated] = await db.update(serviceCatalog).set(data).where(eq(serviceCatalog.id, id)).returning();
    return updated;
  }

  async deleteServiceCatalogItem(id: number): Promise<boolean> {
    const result = await db.delete(serviceCatalog).where(eq(serviceCatalog.id, id)).returning();
    return result.length > 0;
  }

  async seedServiceCatalogIfEmpty(): Promise<void> {
    const existing = await db.select({ id: serviceCatalog.id }).from(serviceCatalog).limit(1);
    if (existing.length > 0) return;
    const seeds = [
      { name: "Tuning", description: "Standard piano tuning to A440.", serviceType: "fixed", unitPrice: "195.00", durationMinutes: 90, isTuning: true, isDefault: true, sortOrder: 1 },
      { name: "Complimentary Tuning", description: "Complimentary tuning included with service.", serviceType: "fixed", unitPrice: "0.00", durationMinutes: 60, isTuning: true, isDefault: false, sortOrder: 2 },
      { name: "Pitch Adjustment", description: "Pitch raise or lowering before fine tuning.", serviceType: "fixed", unitPrice: "55.00", durationMinutes: 30, isTuning: false, isDefault: false, sortOrder: 3 },
      { name: "Voicing", description: "Adjust hammer felt to change tone quality.", serviceType: "hourly", hourlyRate: "100.00", durationMinutes: 60, isTuning: false, isDefault: false, sortOrder: 4 },
      { name: "Regulation", description: "Regulate piano's action to improve touch and make your piano easier to play.", serviceType: "hourly", hourlyRate: "100.00", durationMinutes: 720, isTuning: false, isDefault: false, sortOrder: 5 },
      { name: "Custom Order a New Bass String", description: "Order and install a custom bass string.", serviceType: "fixed", unitPrice: "60.00", durationMinutes: 25, isTuning: false, isDefault: false, sortOrder: 6 },
      { name: "Replace a Broken String", description: "Replace a broken treble string.", serviceType: "fixed", unitPrice: "25.00", durationMinutes: 30, isTuning: false, isDefault: false, sortOrder: 7 },
      { name: "Light Cleaning", description: "Clean interior and keys.", serviceType: "hourly", hourlyRate: "100.00", durationMinutes: 30, isTuning: false, isDefault: false, sortOrder: 8 },
    ];
    await db.insert(serviceCatalog).values(seeds);
  }
}

export const storage = new DatabaseStorage();
