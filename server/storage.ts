import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  customers,
  pianos,
  serviceRecords,
  appointments,
  calendarNotes,
  trips,
  tripAppointments,
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
  type Trip,
  type InsertTrip,
  type TripAppointment,
  type InsertTripAppointment,
} from "@shared/schema";

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  findCustomerByName(firstName: string, lastName: string): Promise<Customer | undefined>;
  getPianos(customerId: number): Promise<Piano[]>;
  getPiano(id: number): Promise<Piano | undefined>;
  createPiano(piano: InsertPiano): Promise<Piano>;
  updatePiano(id: number, data: Partial<InsertPiano>): Promise<Piano | undefined>;
  deletePiano(id: number): Promise<boolean>;
  getServiceRecords(customerId: number): Promise<ServiceRecord[]>;
  getServiceRecordsByPiano(pianoId: number): Promise<ServiceRecord[]>;
  createServiceRecord(record: InsertServiceRecord): Promise<ServiceRecord>;
  getServiceRecord(id: number): Promise<ServiceRecord | undefined>;
  updateServiceRecord(id: number, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;
  deleteServiceRecord(id: number): Promise<boolean>;
  syncPianoLastTuned(pianoId: number): Promise<void>;
  getAppointments(): Promise<Appointment[]>;
  getAppointmentsByCustomer(customerId: number): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<boolean>;
  getCalendarNotes(): Promise<CalendarNote[]>;
  createCalendarNote(note: InsertCalendarNote): Promise<CalendarNote>;
  updateCalendarNote(id: number, data: Partial<InsertCalendarNote>): Promise<CalendarNote | undefined>;
  deleteCalendarNote(id: number): Promise<boolean>;
  getTrips(): Promise<Trip[]>;
  getTrip(id: number): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number): Promise<boolean>;
  getTripAppointments(tripId: number): Promise<TripAppointment[]>;
  createTripAppointment(appointment: InsertTripAppointment): Promise<TripAppointment>;
  updateTripAppointment(id: number, data: Partial<InsertTripAppointment>): Promise<TripAppointment | undefined>;
  deleteTripAppointment(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(customers.lastName);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(customer).returning();
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

  async findCustomerByName(firstName: string, lastName: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.firstName, firstName), eq(customers.lastName, lastName)));
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

  async getAllPianos(): Promise<Piano[]> {
    return db.select().from(pianos).orderBy(pianos.createdAt);
  }

  async getAppointments(): Promise<Appointment[]> {
    return db.select().from(appointments).orderBy(appointments.date);
  }

  async getAppointmentsByCustomer(customerId: number): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.customerId, customerId)).orderBy(appointments.date);
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appointment).returning();
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

  async getCalendarNotes(): Promise<CalendarNote[]> {
    return db.select().from(calendarNotes).orderBy(calendarNotes.date);
  }

  async createCalendarNote(note: InsertCalendarNote): Promise<CalendarNote> {
    const [created] = await db.insert(calendarNotes).values(note).returning();
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

  async getTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(trips.createdAt);
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [created] = await db.insert(trips).values(trip).returning();
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
}

export const storage = new DatabaseStorage();
