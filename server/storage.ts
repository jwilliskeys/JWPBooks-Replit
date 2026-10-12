import { db } from "./db";
import { eq, and, asc, desc, ne } from "drizzle-orm";
import { clientName } from "@shared/client-name";
import {
  getTripPianoServiceGroups,
  hasTuningService,
  isLaterServiceDate,
  parseServiceDate,
  shouldRecordCompletedServices,
} from "./tuning-completion";
import {
  customers,
  pianos,
  serviceRecords,
  serviceGroups,
  serviceCatalog,
  appointments,
  calendarNotes,
  calendarEvents,
  trips,
  tripAppointments,
  tripOutreachCandidates,
  invoices,
  userSettings,
  customerContacts,
  mileageLogs,
  businessExpenses,
  inspections,
  bankAccounts,
  bankTransactions,
  bookingRequests,
  schedulerSettings,
  outreachLeads,
  type Customer,
  type InsertCustomer,
  type Piano,
  type InsertPiano,
  type ServiceRecord,
  type InsertServiceRecord,
  type ServiceGroup,
  type InsertServiceGroup,
  type ServiceCatalogItem,
  type InsertServiceCatalogItem,
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
  type TripOutreachCandidate,
  type Invoice,
  type InsertInvoice,
  type UserSettings,
  type CustomerContact,
  type InsertCustomerContact,
  type MileageLog,
  type InsertMileageLog,
  type BusinessExpense,
  type InsertBusinessExpense,
  type Inspection,
  type InsertInspection,
  type BankAccount,
  type InsertBankAccount,
  type BankTransaction,
  type InsertBankTransaction,
  type BookingRequest,
  type InsertBookingRequest,
  type SchedulerSettings,
  type OutreachLead,
  type InsertOutreachLead,
} from "@shared/schema";

// ─── Piano reassign / merge helpers ──────────────────────────────────────────
// An appointment records its pianos in two places: the pianoId column (the
// first/primary piano, kept for legacy screens) and the serviceItems JSON,
// which is an array of { pianoId, lines } groups — one per piano on the visit.

type ServiceItemGroupish = { pianoId: number | null; lines?: unknown[] };

function parseServiceItems(raw: string | null | undefined): ServiceItemGroupish[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ServiceItemGroupish[]) : null;
  } catch {
    return null;
  }
}

/** True if this appointment also covers pianos other than `pianoId`. */
function appointmentTouchesOtherPianos(raw: string | null | undefined, pianoId: number): boolean {
  const groups = parseServiceItems(raw);
  if (!groups) return false;
  return groups.some(g => g.pianoId != null && g.pianoId !== pianoId);
}

/**
 * Swap `fromId` for `toId` inside a serviceItems JSON string, folding the two
 * groups together if the appointment somehow listed both pianos. Returns the
 * original string untouched when nothing referenced `fromId`, so callers can
 * use identity to detect "no change".
 */
function rewritePianoInServiceItems(raw: string | null | undefined, fromId: number, toId: number): string | null {
  const groups = parseServiceItems(raw);
  if (!groups) return raw ?? null;
  if (!groups.some(g => g.pianoId === fromId)) return raw ?? null;

  const out: ServiceItemGroupish[] = [];
  for (const g of groups) {
    const pianoId = g.pianoId === fromId ? toId : g.pianoId;
    const existing = pianoId != null ? out.find(o => o.pianoId === pianoId) : undefined;
    if (existing) {
      existing.lines = [...(existing.lines ?? []), ...(g.lines ?? [])];
    } else {
      out.push({ ...g, pianoId, lines: [...(g.lines ?? [])] });
    }
  }
  return JSON.stringify(out);
}

function newerDateStr(a: string | null | undefined, b: string | null | undefined): string | null {
  const ts = parseServiceDate;
  const ta = ts(a), tb = ts(b);
  if (ta === null) return b ?? null;
  if (tb === null) return a ?? null;
  return ta >= tb ? (a ?? null) : (b ?? null);
}

/**
 * Build the patch that folds `loser`'s details into `keeper`: the keeper's own
 * values always win, blanks get backfilled from the duplicate, photos and tags
 * combine, notes are appended under a divider, and any "yes" flag stays "yes".
 */
function mergePianoFields(keeper: Piano, loser: Piano): Partial<InsertPiano> {
  const fill = <T,>(k: T | null | undefined, l: T | null | undefined): T | null =>
    (k === null || k === undefined || k === "" ? (l ?? null) : k) as T | null;

  const notes = [keeper.notes?.trim(), loser.notes?.trim()].filter(Boolean);
  const mergedNotes = notes.length > 1
    ? `${notes[0]}\n\n— merged from duplicate piano record —\n${notes[1]}`
    : (notes[0] ?? null);

  const tags = Array.from(new Set([...(keeper.tags ?? []), ...(loser.tags ?? [])]));
  const photos = [...(keeper.photos ?? []), ...(loser.photos ?? []).filter(p => !(keeper.photos ?? []).includes(p))];

  return {
    make: fill(keeper.make, loser.make),
    model: fill(keeper.model, loser.model),
    pianoType: fill(keeper.pianoType, loser.pianoType),
    year: fill(keeper.year, loser.year),
    serialNumber: fill(keeper.serialNumber, loser.serialNumber),
    location: fill(keeper.location, loser.location),
    caseColor: fill(keeper.caseColor, loser.caseColor),
    caseFinish: fill(keeper.caseFinish, loser.caseFinish),
    size: fill(keeper.size, loser.size),
    useType: fill(keeper.useType, loser.useType),
    tuningInterval: fill(keeper.tuningInterval, loser.tuningInterval),
    lastTuned: newerDateStr(keeper.lastTuned, loser.lastTuned),
    notes: mergedNotes,
    tags: tags.length ? tags : null,
    photos: photos.length ? photos : null,
    onConsignment: !!(keeper.onConsignment || loser.onConsignment),
    hasIvory: !!(keeper.hasIvory || loser.hasIvory),
    needsRepair: !!(keeper.needsRepair || loser.needsRepair),
    totalLoss: !!(keeper.totalLoss || loser.totalLoss),
    playerInstalled: !!(keeper.playerInstalled || loser.playerInstalled),
    pianoLifeSaver: !!(keeper.pianoLifeSaver || loser.pianoLifeSaver),
    rentalPiano: !!(keeper.rentalPiano || loser.rentalPiano),
    isActive: keeper.isActive !== false,
  };
}

export interface PianoMergeCounts {
  serviceRecords: number;
  appointments: number;
  tripAppointments: number;
  invoices: number;
  inspections: number;
}

export interface PianoMoveCounts extends PianoMergeCounts {
  /** Shared visits left with the original client because they cover other pianos too. */
  skippedShared: number;
}

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
  reassignPiano(pianoId: number, newCustomerId: number): Promise<PianoMoveCounts | null>;
  mergePianos(keepId: number, mergeId: number): Promise<PianoMergeCounts | null>;
  getServiceRecords(customerId: number): Promise<ServiceRecord[]>;
  getServiceRecordsByPiano(pianoId: number): Promise<ServiceRecord[]>;
  createServiceRecord(record: InsertServiceRecord): Promise<ServiceRecord>;
  getServiceRecord(id: number): Promise<ServiceRecord | undefined>;
  updateServiceRecord(id: number, data: Partial<InsertServiceRecord>): Promise<ServiceRecord | undefined>;
  deleteServiceRecord(id: number): Promise<boolean>;
  syncPianoLastTuned(pianoId: number): Promise<void>;
  getAppointments(userId: string): Promise<Appointment[]>;
  getAppointmentsByCustomer(customerId: number): Promise<Appointment[]>;
  getAppointmentsByPiano(pianoId: number, userId: string): Promise<Appointment[]>;
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
  updateCalendarEvent(id: number, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
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
  completeTripAppointment(id: number, data?: Partial<InsertTripAppointment>): Promise<TripAppointment | undefined>;
  deleteTripAppointment(id: number): Promise<boolean>;
  getTripOutreachCandidates(tripId: number): Promise<TripOutreachCandidate[]>;
  addTripOutreachCandidate(tripId: number, customerId: number): Promise<TripOutreachCandidate>;
  removeTripOutreachCandidate(id: number, tripId: number): Promise<boolean>;
  setTripOutreachCandidateScheduled(tripId: number, customerId: number, tripAppointmentId: number): Promise<void>;
  setTripOutreachCandidateBooked(tripId: number, customerId: number, tripAppointmentId: number): Promise<void>;
  bookTripAppointment(tripAppointmentId: number, userId: string): Promise<{ tripAppointment: TripAppointment; appointmentId: number; alreadyBooked: boolean } | null>;
  getInvoices(userId: string): Promise<Invoice[]>;
  getInvoicesByCustomer(customerId: number, userId: string): Promise<Invoice[]>;
  getInvoicesByPiano(pianoId: number, userId: string): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceByAppointmentId(appointmentId: number): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice, userId: string): Promise<Invoice>;
  updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: number): Promise<boolean>;
  getNextInvoiceNumber(userId: string): Promise<number>;
  getServiceGroups(userId: string): Promise<ServiceGroup[]>;
  createServiceGroup(data: InsertServiceGroup, userId: string): Promise<ServiceGroup>;
  updateServiceGroup(id: number, userId: string, data: Partial<InsertServiceGroup>): Promise<ServiceGroup | undefined>;
  deleteServiceGroup(id: number, userId: string): Promise<boolean>;
  seedServiceGroups(userId: string): Promise<void>;
  getServiceCatalog(userId: string): Promise<ServiceCatalogItem[]>;
  getServiceCatalogItem(id: number): Promise<ServiceCatalogItem | undefined>;
  createServiceCatalogItem(item: InsertServiceCatalogItem, userId: string): Promise<ServiceCatalogItem>;
  updateServiceCatalogItem(id: number, data: Partial<InsertServiceCatalogItem>, userId?: string): Promise<ServiceCatalogItem | undefined>;
  deleteServiceCatalogItem(id: number, userId?: string): Promise<boolean>;
  seedServiceCatalog(userId: string): Promise<void>;
  setDefaultService(id: number, userId: string): Promise<ServiceCatalogItem | undefined>;
  completeAppointment(appointmentId: number, data: {
    result: string;
    clientNotes: string;
    pianoRecords: Array<{
      pianoId: number | null;
      isTuning: boolean;
      notes: string;
      humidity: string;
      temperature: string;
      services: string;
    }>;
    miscServices: string;
    appointmentDate: string;
    customerId: number;
  }): Promise<void>;
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(userId: string, data: Partial<Omit<UserSettings, "userId" | "updatedAt">>): Promise<UserSettings>;
  getCustomerContacts(customerId: number): Promise<CustomerContact[]>;
  createCustomerContact(contact: InsertCustomerContact, userId: string): Promise<CustomerContact>;
  getCustomerContact(id: number): Promise<CustomerContact | undefined>;
  updateCustomerContact(id: number, data: Partial<InsertCustomerContact>): Promise<CustomerContact | undefined>;
  deleteCustomerContact(id: number): Promise<boolean>;
  setPrimaryContact(id: number, customerId: number): Promise<CustomerContact | undefined>;
  getMileageLogs(userId: string): Promise<MileageLog[]>;
  getMileageLog(id: number, userId: string): Promise<MileageLog | undefined>;
  createMileageLog(log: InsertMileageLog, userId: string): Promise<MileageLog>;
  updateMileageLog(id: number, userId: string, data: Partial<InsertMileageLog>): Promise<MileageLog | undefined>;
  deleteMileageLog(id: number, userId: string): Promise<boolean>;
  getBusinessExpenses(userId: string): Promise<BusinessExpense[]>;
  getBusinessExpense(id: number, userId: string): Promise<BusinessExpense | undefined>;
  createBusinessExpense(expense: InsertBusinessExpense, userId: string): Promise<BusinessExpense>;
  updateBusinessExpense(id: number, userId: string, data: Partial<InsertBusinessExpense>): Promise<BusinessExpense | undefined>;
  deleteBusinessExpense(id: number, userId: string): Promise<boolean>;
  getOutreachLeads(userId: string): Promise<OutreachLead[]>;
  getOutreachLead(id: number, userId: string): Promise<OutreachLead | undefined>;
  createOutreachLead(lead: InsertOutreachLead, userId: string): Promise<OutreachLead>;
  updateOutreachLead(id: number, userId: string, data: Partial<InsertOutreachLead>): Promise<OutreachLead | undefined>;
  deleteOutreachLead(id: number, userId: string): Promise<boolean>;
  getBookingRequests(userId: string): Promise<BookingRequest[]>;
  createBookingRequest(data: InsertBookingRequest, userId: string): Promise<BookingRequest>;
  updateBookingRequest(id: number, data: Partial<BookingRequest>): Promise<BookingRequest | undefined>;
  deleteBookingRequest(id: number): Promise<boolean>;
  getSchedulerSettings(userId: string): Promise<SchedulerSettings | undefined>;
  upsertSchedulerSettings(userId: string, data: Partial<Omit<SchedulerSettings, "userId" | "updatedAt">>): Promise<SchedulerSettings>;
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

  // ─── Reassign / merge ─────────────────────────────────────────────────────
  //
  // Two related maintenance operations on pianos:
  //   reassignPiano  — this piano now belongs to a different client.
  //   mergePianos    — two rows are really the same instrument; fold one in.
  //
  // Both have to chase every table that carries a piano_id: service_records,
  // appointments (including the serviceItems JSON, which holds a pianoId per
  // group), trip_appointments, invoices, and inspections.

  /**
   * Move `pianoId` to `newCustomerId`, dragging its whole paper trail along.
   *
   * Appointments (and the invoices generated from them) that ALSO cover other
   * pianos belonging to the original client are deliberately left behind — a
   * joint visit was billed to that client and shouldn't be silently rewritten.
   * The counts returned say what moved and what was skipped.
   */
  async reassignPiano(pianoId: number, newCustomerId: number): Promise<PianoMoveCounts | null> {
    const piano = await this.getPiano(pianoId);
    if (!piano) return null;
    const oldCustomerId = piano.customerId;
    if (oldCustomerId === newCustomerId) {
      return { serviceRecords: 0, appointments: 0, tripAppointments: 0, invoices: 0, inspections: 0, skippedShared: 0 };
    }
    const newCustomer = await this.getCustomer(newCustomerId);
    if (!newCustomer) return null;

    const counts = { serviceRecords: 0, appointments: 0, tripAppointments: 0, invoices: 0, inspections: 0, skippedShared: 0 };

    await db.update(pianos).set({ customerId: newCustomerId }).where(eq(pianos.id, pianoId));

    const svc = await db.update(serviceRecords)
      .set({ customerId: newCustomerId })
      .where(eq(serviceRecords.pianoId, pianoId))
      .returning({ id: serviceRecords.id });
    counts.serviceRecords = svc.length;

    // Appointments: only move the ones that are about this piano alone.
    const appts = await db.select().from(appointments).where(eq(appointments.pianoId, pianoId));
    const movedApptIds = new Set<number>();
    for (const a of appts) {
      if (appointmentTouchesOtherPianos(a.serviceItems, pianoId)) {
        counts.skippedShared++;
        continue;
      }
      await db.update(appointments).set({ customerId: newCustomerId }).where(eq(appointments.id, a.id));
      movedApptIds.add(a.id);
      counts.appointments++;
    }

    const tripAppts = await db.update(tripAppointments)
      .set({ customerId: newCustomerId })
      .where(eq(tripAppointments.pianoId, pianoId))
      .returning({ id: tripAppointments.id });
    counts.tripAppointments = tripAppts.length;

    // Invoices: skip any tied to an appointment we deliberately left behind.
    const customerAddress = [newCustomer.address, newCustomer.city, newCustomer.state, newCustomer.zipCode]
      .filter(Boolean).join(", ");
    const invs = await db.select().from(invoices).where(eq(invoices.pianoId, pianoId));
    for (const inv of invs) {
      if (inv.appointmentId && !movedApptIds.has(inv.appointmentId)) continue;
      await db.update(invoices).set({
        customerId: newCustomerId,
        customerName: clientName(newCustomer),
        customerEmail: newCustomer.email ?? "",
        customerAddress,
        customerPhone: newCustomer.phone ?? "",
      }).where(eq(invoices.id, inv.id));
      counts.invoices++;
    }

    const insp = await db.update(inspections)
      .set({ customerId: newCustomerId })
      .where(eq(inspections.pianoId, pianoId))
      .returning({ id: inspections.id });
    counts.inspections = insp.length;

    await this.syncCustomerFromPianos(oldCustomerId);
    await this.syncCustomerFromPianos(newCustomerId);
    return counts;
  }

  /**
   * Fold `mergeId` into `keepId`: every record pointed at the duplicate is
   * repointed at the keeper, blank fields on the keeper are backfilled from
   * the duplicate, photos/tags are combined, then the duplicate row is removed.
   *
   * Deliberately does NOT go through deletePiano() — that wipes service
   * records, which by this point belong to the keeper.
   */
  async mergePianos(keepId: number, mergeId: number): Promise<PianoMergeCounts | null> {
    if (keepId === mergeId) return null;
    const keeper = await this.getPiano(keepId);
    const loser = await this.getPiano(mergeId);
    if (!keeper || !loser) return null;
    const keeperCustomer = await this.getCustomer(keeper.customerId);
    if (!keeperCustomer) return null;
    const crossClient = keeper.customerId !== loser.customerId;

    const counts = { serviceRecords: 0, appointments: 0, tripAppointments: 0, invoices: 0, inspections: 0 };
    const ownerPatch = crossClient ? { customerId: keeper.customerId } : {};

    const svc = await db.update(serviceRecords)
      .set({ pianoId: keepId, ...ownerPatch })
      .where(eq(serviceRecords.pianoId, mergeId))
      .returning({ id: serviceRecords.id });
    counts.serviceRecords = svc.length;

    // Appointments carry the piano twice: the pianoId column and the
    // serviceItems JSON. Rewrite both, collapsing duplicate groups.
    const appts = await db.select().from(appointments).where(eq(appointments.pianoId, mergeId));
    for (const a of appts) {
      await db.update(appointments)
        .set({ pianoId: keepId, serviceItems: rewritePianoInServiceItems(a.serviceItems, mergeId, keepId), ...ownerPatch })
        .where(eq(appointments.id, a.id));
      counts.appointments++;
    }
    // Multi-piano appointments whose pianoId column points elsewhere.
    const otherAppts = await db.select().from(appointments).where(eq(appointments.customerId, loser.customerId));
    for (const a of otherAppts) {
      if (a.pianoId === mergeId) continue;
      const rewritten = rewritePianoInServiceItems(a.serviceItems, mergeId, keepId);
      if (rewritten === a.serviceItems) continue;
      await db.update(appointments).set({ serviceItems: rewritten }).where(eq(appointments.id, a.id));
    }

    const tripAppts = await db.update(tripAppointments)
      .set({ pianoId: keepId, ...ownerPatch })
      .where(eq(tripAppointments.pianoId, mergeId))
      .returning({ id: tripAppointments.id });
    counts.tripAppointments = tripAppts.length;

    const invoicePatch = crossClient
      ? {
          pianoId: keepId,
          customerId: keeper.customerId,
          customerName: clientName(keeperCustomer),
          customerEmail: keeperCustomer.email ?? "",
          customerAddress: [keeperCustomer.address, keeperCustomer.city, keeperCustomer.state, keeperCustomer.zipCode]
            .filter(Boolean).join(", "),
          customerPhone: keeperCustomer.phone ?? "",
        }
      : { pianoId: keepId };
    const invs = await db.update(invoices)
      .set(invoicePatch)
      .where(eq(invoices.pianoId, mergeId))
      .returning({ id: invoices.id });
    counts.invoices = invs.length;

    const insp = await db.update(inspections)
      .set({ pianoId: keepId, ...ownerPatch })
      .where(eq(inspections.pianoId, mergeId))
      .returning({ id: inspections.id });
    counts.inspections = insp.length;

    await db.update(pianos).set(mergePianoFields(keeper, loser)).where(eq(pianos.id, keepId));
    await db.delete(pianos).where(eq(pianos.id, mergeId));

    await this.syncPianoLastTuned(keepId);
    await this.syncCustomerFromPianos(keeper.customerId);
    if (crossClient) await this.syncCustomerFromPianos(loser.customerId);
    return counts;
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

  async getAppointmentsByPiano(pianoId: number, userId: string): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(and(eq(appointments.pianoId, pianoId), eq(appointments.userId, userId)))
      .orderBy(desc(appointments.date));
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
    const tuningRecords = records.filter(r => r.isTuning || /tuning/i.test(r.serviceType || ""));
    let mostRecentDate: number | null = null;
    let mostRecentStr: string | null = null;
    for (const r of tuningRecords) {
      const date = parseServiceDate(r.serviceDate);
      if (date !== null && (mostRecentDate === null || date > mostRecentDate)) {
        mostRecentDate = date;
        mostRecentStr = r.serviceDate;
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

  async updateCalendarEvent(id: number, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const [updated] = await db.update(calendarEvents).set(data).where(eq(calendarEvents.id, id)).returning();
    return updated;
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
    await db.delete(tripOutreachCandidates).where(eq(tripOutreachCandidates.tripId, id));
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

  async completeTripAppointment(
    id: number,
    data: Partial<InsertTripAppointment> = {},
  ): Promise<TripAppointment | undefined> {
    const customerId = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(tripAppointments)
        .where(eq(tripAppointments.id, id))
        .for("update");
      if (!current || current.status === "cancelled") return undefined;

      const updatedFields = { ...data };
      delete updatedFields.status;
      const [updated] = await tx.update(tripAppointments)
        .set({ ...updatedFields, status: "completed" })
        .where(eq(tripAppointments.id, id))
        .returning();
      if (current.status === "completed") return undefined;
      const completedStop = { ...current, ...updatedFields, status: "completed" };

      if (completedStop.linkedAppointmentId) {
        await tx.update(appointments)
          .set({ status: "completed" })
          .where(eq(appointments.id, completedStop.linkedAppointmentId));
      }

      const groups = getTripPianoServiceGroups(
        completedStop.serviceItems,
        completedStop.pianoId,
        completedStop.servicesRequested,
      );

      const perPiano = new Map<number, Array<Record<string, unknown>>>();
      for (const group of groups) {
        if (group.pianoId === null) continue;
        perPiano.set(group.pianoId, [...(perPiano.get(group.pianoId) ?? []), ...group.lines]);
      }

      for (const [pianoId, lines] of perPiano) {
        const [piano] = await tx.select().from(pianos).where(eq(pianos.id, pianoId)).for("update");
        if (!piano || piano.customerId !== completedStop.customerId) continue;
        const isTuning = lines.some((line) =>
          hasTuningService(line.isTuning === true, String(line.name ?? ""), null));
        await tx.insert(serviceRecords).values({
          customerId: completedStop.customerId,
          pianoId,
          serviceDate: completedStop.date,
          serviceType: isTuning ? "tuning" : "service",
          notes: completedStop.notes || null,
          cost: null,
          humidity: null,
          temperature: null,
          services: JSON.stringify(lines),
          isTuning,
          appointmentId: completedStop.linkedAppointmentId ?? null,
        });
        if (isTuning && isLaterServiceDate(completedStop.date, piano.lastTuned)) {
          await tx.update(pianos).set({ lastTuned: completedStop.date }).where(eq(pianos.id, pianoId));
        }
      }

      await tx.update(customers)
        .set({ lastContacted: completedStop.date })
        .where(eq(customers.id, completedStop.customerId));
      return updated?.customerId;
    });
    if (customerId !== undefined) await this.syncCustomerFromPianos(customerId);
    return this.getTripAppointment(id);
  }

  async deleteTripAppointment(id: number): Promise<boolean> {
    const result = await db.delete(tripAppointments).where(eq(tripAppointments.id, id)).returning();
    return result.length > 0;
  }

  async getTripOutreachCandidates(tripId: number): Promise<TripOutreachCandidate[]> {
    return db.select().from(tripOutreachCandidates)
      .where(eq(tripOutreachCandidates.tripId, tripId))
      .orderBy(tripOutreachCandidates.createdAt);
  }

  async addTripOutreachCandidate(tripId: number, customerId: number): Promise<TripOutreachCandidate> {
    const [candidate] = await db.insert(tripOutreachCandidates)
      .values({ tripId, customerId, status: "candidate" })
      .onConflictDoUpdate({
        target: [tripOutreachCandidates.tripId, tripOutreachCandidates.customerId],
        set: { customerId },
      })
      .returning();
    return candidate;
  }

  async removeTripOutreachCandidate(id: number, tripId: number): Promise<boolean> {
    const result = await db.delete(tripOutreachCandidates)
      .where(and(eq(tripOutreachCandidates.id, id), eq(tripOutreachCandidates.tripId, tripId)))
      .returning();
    return result.length > 0;
  }

  async setTripOutreachCandidateScheduled(tripId: number, customerId: number, tripAppointmentId: number): Promise<void> {
    await db.update(tripOutreachCandidates)
      .set({ status: "scheduled", tripAppointmentId })
      .where(and(
        eq(tripOutreachCandidates.tripId, tripId),
        eq(tripOutreachCandidates.customerId, customerId),
      ));
  }

  async setTripOutreachCandidateBooked(tripId: number, customerId: number, tripAppointmentId: number): Promise<void> {
    await db.update(tripOutreachCandidates)
      .set({ status: "booked", tripAppointmentId })
      .where(and(
        eq(tripOutreachCandidates.tripId, tripId),
        eq(tripOutreachCandidates.customerId, customerId),
      ));
  }

  async bookTripAppointment(
    tripAppointmentId: number,
    userId: string,
  ): Promise<{ tripAppointment: TripAppointment; appointmentId: number; alreadyBooked: boolean } | null> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(tripAppointments)
        .where(eq(tripAppointments.id, tripAppointmentId))
        .for("update");
      if (!current) return null;
      if (current.linkedAppointmentId) {
        await tx.update(tripOutreachCandidates)
          .set({ status: "booked", tripAppointmentId: current.id })
          .where(and(
            eq(tripOutreachCandidates.tripId, current.tripId),
            eq(tripOutreachCandidates.customerId, current.customerId),
          ));
        return {
          tripAppointment: current,
          appointmentId: current.linkedAppointmentId,
          alreadyBooked: true,
        };
      }
      if (current.status === "cancelled" || current.status === "completed") return null;

      let groups: Array<{ pianoId?: number | null; lines?: Array<{ isTuning?: boolean }> }> = [];
      try { groups = current.serviceItems ? JSON.parse(current.serviceItems) : []; } catch {}
      const isTuning = groups.some((group) => group.lines?.some((line) => line.isTuning))
        || (current.servicesRequested || "").toLowerCase().includes("tuning");
      const [appointment] = await tx.insert(appointments).values({
        userId,
        customerId: current.customerId,
        pianoId: groups.find((group) => group.pianoId != null)?.pianoId ?? current.pianoId,
        date: current.date,
        time: current.time,
        duration: current.duration,
        servicesRequested: current.servicesRequested,
        priceEstimate: current.priceEstimate,
        notes: current.notes,
        isTuning,
        serviceItems: current.serviceItems,
        status: "scheduled",
      }).returning();
      const [bookedStop] = await tx.update(tripAppointments)
        .set({ linkedAppointmentId: appointment.id })
        .where(eq(tripAppointments.id, current.id))
        .returning();
      await tx.update(tripOutreachCandidates)
        .set({ status: "booked", tripAppointmentId: current.id })
        .where(and(
          eq(tripOutreachCandidates.tripId, current.tripId),
          eq(tripOutreachCandidates.customerId, current.customerId),
        ));
      return {
        tripAppointment: bookedStop ?? { ...current, linkedAppointmentId: appointment.id },
        appointmentId: appointment.id,
        alreadyBooked: false,
      };
    });
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(invoices.createdAt);
  }

  async getInvoicesByCustomer(customerId: number, userId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(and(eq(invoices.customerId, customerId), eq(invoices.userId, userId)))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByPiano(pianoId: number, userId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(and(eq(invoices.pianoId, pianoId), eq(invoices.userId, userId)))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceByAppointmentId(appointmentId: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.appointmentId, appointmentId));
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

  async getServiceGroups(userId: string): Promise<ServiceGroup[]> {
    return db.select().from(serviceGroups)
      .where(eq(serviceGroups.userId, userId))
      .orderBy(asc(serviceGroups.sortOrder), asc(serviceGroups.name));
  }

  async createServiceGroup(data: InsertServiceGroup, userId: string): Promise<ServiceGroup> {
    const [created] = await db.insert(serviceGroups).values({ ...data, userId }).returning();
    return created;
  }

  async updateServiceGroup(id: number, userId: string, data: Partial<InsertServiceGroup>): Promise<ServiceGroup | undefined> {
    const [updated] = await db.update(serviceGroups).set(data)
      .where(and(eq(serviceGroups.id, id), eq(serviceGroups.userId, userId)))
      .returning();
    return updated;
  }

  async deleteServiceGroup(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(serviceGroups)
      .where(and(eq(serviceGroups.id, id), eq(serviceGroups.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async seedServiceGroups(userId: string): Promise<void> {
    const existing = await this.getServiceGroups(userId);
    if (existing.length > 0) return;
    const groups = [
      { name: "Field Service", sortOrder: 0 },
      { name: "Shopwork", sortOrder: 1 },
      { name: "Institutional", sortOrder: 2 },
      { name: "Inspection", sortOrder: 3 },
    ];
    for (const g of groups) {
      await db.insert(serviceGroups).values({ ...g, userId }).onConflictDoNothing();
    }
    const categoryRemap: Record<string, string> = {
      "Tuning": "Field Service",
      "Maintenance": "Field Service",
      "Repair": "Shopwork",
      "Consultation": "Inspection",
    };
    const items = await this.getServiceCatalog(userId);
    for (const item of items) {
      if (item.category && categoryRemap[item.category]) {
        await db.update(serviceCatalog)
          .set({ category: categoryRemap[item.category] })
          .where(eq(serviceCatalog.id, item.id));
      }
    }
  }

  async getServiceCatalog(userId: string): Promise<ServiceCatalogItem[]> {
    return db.select().from(serviceCatalog)
      .where(eq(serviceCatalog.userId, userId))
      .orderBy(asc(serviceCatalog.sortOrder), asc(serviceCatalog.name));
  }

  async getServiceCatalogItem(id: number): Promise<ServiceCatalogItem | undefined> {
    const [item] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, id));
    return item;
  }

  async createServiceCatalogItem(item: InsertServiceCatalogItem, userId: string): Promise<ServiceCatalogItem> {
    const [created] = await db.insert(serviceCatalog).values({ ...item, userId }).returning();
    return created;
  }

  async updateServiceCatalogItem(id: number, data: Partial<InsertServiceCatalogItem>, userId?: string): Promise<ServiceCatalogItem | undefined> {
    const condition = userId
      ? and(eq(serviceCatalog.id, id), eq(serviceCatalog.userId, userId))
      : eq(serviceCatalog.id, id);
    const [updated] = await db.update(serviceCatalog).set(data).where(condition).returning();
    return updated;
  }

  async deleteServiceCatalogItem(id: number, userId?: string): Promise<boolean> {
    const condition = userId
      ? and(eq(serviceCatalog.id, id), eq(serviceCatalog.userId, userId))
      : eq(serviceCatalog.id, id);
    const result = await db.delete(serviceCatalog).where(condition).returning();
    return result.length > 0;
  }

  async seedServiceCatalog(userId: string): Promise<void> {
    const existing = await this.getServiceCatalog(userId);
    if (existing.length > 0) return;
    const seeds = [
      { name: "Tuning", category: "Field Service", defaultCost: "$150", defaultDuration: "1.0 hr", isTuning: true, isDefault: true, sortOrder: 0 },
      { name: "Pitch Raise", category: "Field Service", defaultCost: "$75", defaultDuration: "0.5 hr", isTuning: true, isDefault: false, sortOrder: 1 },
      { name: "Regulation", category: "Shopwork", defaultCost: "$200", defaultDuration: "2.0 hr", isTuning: false, isDefault: false, sortOrder: 0 },
      { name: "Voicing", category: "Shopwork", defaultCost: "$175", defaultDuration: "1.5 hr", isTuning: false, isDefault: false, sortOrder: 1 },
      { name: "Minor Repair", category: "Shopwork", defaultCost: "$100", defaultDuration: "1.0 hr", isTuning: false, isDefault: false, sortOrder: 2 },
      { name: "Major Repair", category: "Shopwork", defaultCost: "$300", defaultDuration: "4.0 hr", isTuning: false, isDefault: false, sortOrder: 3 },
      { name: "Cleaning/Inspection", category: "Inspection", defaultCost: "$75", defaultDuration: "1.0 hr", isTuning: false, isDefault: false, sortOrder: 0 },
      { name: "Estimate", category: "Inspection", defaultCost: "$0", defaultDuration: "0.5 hr", isTuning: false, isDefault: false, sortOrder: 1 },
    ];
    for (const seed of seeds) {
      await db.insert(serviceCatalog).values({ ...seed, userId, isActive: true }).onConflictDoNothing();
    }
  }

  async setDefaultService(id: number, userId: string): Promise<ServiceCatalogItem | undefined> {
    const [target] = await db.select().from(serviceCatalog)
      .where(and(eq(serviceCatalog.id, id), eq(serviceCatalog.userId, userId)));
    if (!target) return undefined;
    return db.transaction(async (tx) => {
      await tx.update(serviceCatalog)
        .set({ isDefault: false })
        .where(eq(serviceCatalog.userId, userId));
      const [updated] = await tx.update(serviceCatalog)
        .set({ isDefault: true })
        .where(and(eq(serviceCatalog.id, id), eq(serviceCatalog.userId, userId)))
        .returning();
      return updated;
    });
  }

  async completeAppointment(appointmentId: number, data: {
    result: string;
    clientNotes: string;
    pianoRecords: Array<{
      pianoId: number | null;
      isTuning: boolean;
      notes: string;
      humidity: string;
      temperature: string;
      services: string;
      /** JSON summary parsed from an attached .pianoscope tuning file */
      pianoscope?: string | null;
      /** e.g. "Fine Tuning" / "Pitch Raise + Fine Tuning" (from the pianoscope file) */
      serviceType?: string | null;
    }>;
    miscServices: string;
    appointmentDate: string;
    customerId: number;
  }): Promise<void> {
    let completed = false;
    await db.transaction(async (tx) => {
      const [appointment] = await tx.select().from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for("update");
      if (!appointment) return;
      await tx.update(appointments)
        .set({ status: data.result, notes: data.clientNotes || null })
        .where(eq(appointments.id, appointmentId));
      if (!shouldRecordCompletedServices(data.result)) return;
      completed = true;

      const existingRecords = await tx.select().from(serviceRecords)
        .where(eq(serviceRecords.appointmentId, appointmentId));
      for (const rec of data.pianoRecords) {
        const serviceType = rec.serviceType || (rec.isTuning ? "tuning" : "service");
        const isTuning = hasTuningService(rec.isTuning, serviceType, rec.services);
        const values = {
          customerId: data.customerId,
          pianoId: rec.pianoId ?? null,
          serviceDate: data.appointmentDate,
          serviceType,
          notes: rec.notes || null,
          cost: null,
          humidity: rec.humidity || null,
          temperature: rec.temperature || null,
          services: rec.services || "[]",
          isTuning,
          appointmentId,
          pianoscope: rec.pianoscope || null,
        };
        const existingRecord = existingRecords.find((record) => record.pianoId === (rec.pianoId ?? null));
        if (existingRecord) {
          await tx.update(serviceRecords).set(values).where(eq(serviceRecords.id, existingRecord.id));
        } else {
          await tx.insert(serviceRecords).values(values);
        }

        if (isTuning && rec.pianoId) {
          const [piano] = await tx.select().from(pianos).where(eq(pianos.id, rec.pianoId)).for("update");
          if (piano && isLaterServiceDate(data.appointmentDate, piano.lastTuned)) {
            await tx.update(pianos).set({ lastTuned: data.appointmentDate }).where(eq(pianos.id, rec.pianoId));
          }
        }
      }

      if (data.miscServices && data.miscServices !== "[]") {
        const values = {
          customerId: data.customerId,
          pianoId: null,
          serviceDate: data.appointmentDate,
          serviceType: "misc",
          notes: null,
          cost: null,
          humidity: null,
          temperature: null,
          services: data.miscServices,
          isTuning: false,
          appointmentId,
        };
        const existingMisc = existingRecords.find((record) => record.pianoId === null && record.serviceType === "misc");
        if (existingMisc) {
          await tx.update(serviceRecords).set(values).where(eq(serviceRecords.id, existingMisc.id));
        } else {
          await tx.insert(serviceRecords).values(values);
        }
      }

      await tx.update(customers)
        .set({ lastContacted: data.appointmentDate })
        .where(eq(customers.id, data.customerId));
    });

    if (completed) await this.syncCustomerFromPianos(data.customerId);
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
    let mostRecentDate: number | null = null;
    for (const p of activePianos) {
      if (!p.lastTuned) continue;
      const date = parseServiceDate(p.lastTuned);
      if (date !== null && (mostRecentDate === null || date > mostRecentDate)) {
        mostRecentDate = date;
        mostRecentTuned = p.lastTuned;
      }
    }
    await this.updateCustomer(customerId, { pianoType, lastTuned: mostRecentTuned });
  }

  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return row;
  }

  async upsertUserSettings(userId: string, data: Partial<Omit<UserSettings, "userId" | "updatedAt">>): Promise<UserSettings> {
    const [row] = await db.insert(userSettings)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getCustomerContacts(customerId: number): Promise<CustomerContact[]> {
    const rows = await db.select().from(customerContacts)
      .where(eq(customerContacts.customerId, customerId))
      .orderBy(customerContacts.id);
    // Sort: primary first, billing second, then by id ascending.
    return rows.sort((a, b) => {
      if (!!a.isPrimary !== !!b.isPrimary) return a.isPrimary ? -1 : 1;
      if (!!a.isBilling !== !!b.isBilling) return a.isBilling ? -1 : 1;
      return a.id - b.id;
    });
  }

  async createCustomerContact(contact: InsertCustomerContact, userId: string): Promise<CustomerContact> {
    if (contact.isPrimary) {
      await db.update(customerContacts)
        .set({ isPrimary: false })
        .where(eq(customerContacts.customerId, contact.customerId));
    }
    if (contact.isBilling) {
      await db.update(customerContacts)
        .set({ isBilling: false })
        .where(eq(customerContacts.customerId, contact.customerId));
    }
    const [created] = await db.insert(customerContacts).values({ ...contact, userId }).returning();
    return created;
  }

  async getCustomerContact(id: number): Promise<CustomerContact | undefined> {
    const [contact] = await db.select().from(customerContacts).where(eq(customerContacts.id, id));
    return contact;
  }

  async updateCustomerContact(id: number, data: Partial<InsertCustomerContact>): Promise<CustomerContact | undefined> {
    if (data.isPrimary || data.isBilling) {
      const [existing] = await db.select().from(customerContacts).where(eq(customerContacts.id, id));
      if (existing) {
        if (data.isPrimary) {
          await db.update(customerContacts)
            .set({ isPrimary: false })
            .where(and(
              eq(customerContacts.customerId, existing.customerId),
              ne(customerContacts.id, id),
            ));
        }
        if (data.isBilling) {
          await db.update(customerContacts)
            .set({ isBilling: false })
            .where(and(
              eq(customerContacts.customerId, existing.customerId),
              ne(customerContacts.id, id),
            ));
        }
      }
    }
    const [updated] = await db.update(customerContacts).set(data).where(eq(customerContacts.id, id)).returning();
    return updated;
  }

  async deleteCustomerContact(id: number): Promise<boolean> {
    const result = await db.delete(customerContacts).where(eq(customerContacts.id, id)).returning();
    return result.length > 0;
  }

  async setPrimaryContact(id: number, customerId: number): Promise<CustomerContact | undefined> {
    return db.transaction(async (tx) => {
      await tx.update(customerContacts)
        .set({ isPrimary: false })
        .where(eq(customerContacts.customerId, customerId));
      const [updated] = await tx.update(customerContacts)
        .set({ isPrimary: true })
        .where(eq(customerContacts.id, id))
        .returning();
      return updated;
    });
  }

  async getMileageLogs(userId: string): Promise<MileageLog[]> {
    return db.select().from(mileageLogs)
      .where(eq(mileageLogs.userId, userId))
      .orderBy(desc(mileageLogs.date));
  }

  async getMileageLog(id: number, userId: string): Promise<MileageLog | undefined> {
    const [log] = await db.select().from(mileageLogs)
      .where(and(eq(mileageLogs.id, id), eq(mileageLogs.userId, userId)));
    return log;
  }

  async createMileageLog(log: InsertMileageLog, userId: string): Promise<MileageLog> {
    const [created] = await db.insert(mileageLogs).values({ ...log, userId }).returning();
    return created;
  }

  async updateMileageLog(id: number, userId: string, data: Partial<InsertMileageLog>): Promise<MileageLog | undefined> {
    const [updated] = await db.update(mileageLogs)
      .set(data)
      .where(and(eq(mileageLogs.id, id), eq(mileageLogs.userId, userId)))
      .returning();
    return updated;
  }

  async deleteMileageLog(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(mileageLogs)
      .where(and(eq(mileageLogs.id, id), eq(mileageLogs.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getBusinessExpenses(userId: string): Promise<BusinessExpense[]> {
    return db.select().from(businessExpenses)
      .where(eq(businessExpenses.userId, userId))
      .orderBy(desc(businessExpenses.date));
  }

  async getBusinessExpense(id: number, userId: string): Promise<BusinessExpense | undefined> {
    const [expense] = await db.select().from(businessExpenses)
      .where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)));
    return expense;
  }

  async createBusinessExpense(expense: InsertBusinessExpense, userId: string): Promise<BusinessExpense> {
    const [created] = await db.insert(businessExpenses).values({ ...expense, userId }).returning();
    return created;
  }

  async updateBusinessExpense(id: number, userId: string, data: Partial<InsertBusinessExpense>): Promise<BusinessExpense | undefined> {
    const [updated] = await db.update(businessExpenses)
      .set(data)
      .where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)))
      .returning();
    return updated;
  }

  async deleteBusinessExpense(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(businessExpenses)
      .where(and(eq(businessExpenses.id, id), eq(businessExpenses.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Outreach Leads ─────────────────────────────────────────────────────────

  async getOutreachLeads(userId: string): Promise<OutreachLead[]> {
    return db.select().from(outreachLeads)
      .where(eq(outreachLeads.userId, userId))
      .orderBy(asc(outreachLeads.city), asc(outreachLeads.name));
  }

  async getOutreachLead(id: number, userId: string): Promise<OutreachLead | undefined> {
    const [lead] = await db.select().from(outreachLeads)
      .where(and(eq(outreachLeads.id, id), eq(outreachLeads.userId, userId)));
    return lead;
  }

  async createOutreachLead(lead: InsertOutreachLead, userId: string): Promise<OutreachLead> {
    const [created] = await db.insert(outreachLeads).values({ ...lead, userId }).returning();
    return created;
  }

  async updateOutreachLead(id: number, userId: string, data: Partial<InsertOutreachLead>): Promise<OutreachLead | undefined> {
    const [updated] = await db.update(outreachLeads)
      .set(data)
      .where(and(eq(outreachLeads.id, id), eq(outreachLeads.userId, userId)))
      .returning();
    return updated;
  }

  async deleteOutreachLead(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(outreachLeads)
      .where(and(eq(outreachLeads.id, id), eq(outreachLeads.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Inspections / Estimates ────────────────────────────────────────────────

  async getInspections(userId: string): Promise<Inspection[]> {
    return db.select().from(inspections)
      .where(eq(inspections.userId, userId))
      .orderBy(desc(inspections.inspectionDate));
  }

  async getInspectionsByCustomer(customerId: number, userId: string): Promise<Inspection[]> {
    return db.select().from(inspections)
      .where(and(eq(inspections.customerId, customerId), eq(inspections.userId, userId)))
      .orderBy(desc(inspections.inspectionDate));
  }

  async getInspection(id: number, userId: string): Promise<Inspection | undefined> {
    const [inspection] = await db.select().from(inspections)
      .where(and(eq(inspections.id, id), eq(inspections.userId, userId)));
    return inspection;
  }

  async createInspection(data: InsertInspection, userId: string): Promise<Inspection> {
    const [created] = await db.insert(inspections).values({ ...data, userId }).returning();
    return created;
  }

  async updateInspection(id: number, userId: string, data: Partial<InsertInspection>): Promise<Inspection | undefined> {
    const [updated] = await db.update(inspections)
      .set(data)
      .where(and(eq(inspections.id, id), eq(inspections.userId, userId)))
      .returning();
    return updated;
  }

  async deleteInspection(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(inspections)
      .where(and(eq(inspections.id, id), eq(inspections.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Plaid Bank Feed ────────────────────────────────────────────────────────

  async getBankAccounts(userId: string): Promise<BankAccount[]> {
    return db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true)))
      .orderBy(desc(bankAccounts.createdAt));
  }

  async getBankAccount(id: number, userId: string): Promise<BankAccount | undefined> {
    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
    return account;
  }

  async createBankAccount(data: InsertBankAccount): Promise<BankAccount> {
    const [created] = await db.insert(bankAccounts).values(data).returning();
    return created;
  }

  async updateBankAccount(id: number, userId: string, data: Partial<InsertBankAccount>): Promise<BankAccount | undefined> {
    const [updated] = await db.update(bankAccounts)
      .set(data)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)))
      .returning();
    return updated;
  }

  async deleteBankAccount(id: number, userId: string): Promise<boolean> {
    const result = await db.update(bankAccounts)
      .set({ isActive: false })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getBankTransactions(userId: string, limit = 200): Promise<BankTransaction[]> {
    return db.select().from(bankTransactions)
      .where(eq(bankTransactions.userId, userId))
      .orderBy(desc(bankTransactions.date))
      .limit(limit);
  }

  async getBankTransactionsByAccount(accountId: number, userId: string): Promise<BankTransaction[]> {
    return db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, accountId), eq(bankTransactions.userId, userId)))
      .orderBy(desc(bankTransactions.date));
  }

  async upsertBankTransactions(txns: InsertBankTransaction[]): Promise<void> {
    if (txns.length === 0) return;
    for (const txn of txns) {
      await db.insert(bankTransactions)
        .values(txn)
        .onConflictDoNothing();
    }
  }

  async updateBankTransaction(id: number, userId: string, data: Partial<InsertBankTransaction>): Promise<BankTransaction | undefined> {
    const [updated] = await db.update(bankTransactions)
      .set(data)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.userId, userId)))
      .returning();
    return updated;
  }

  // ── Booking Requests ────────────────────────────────────────────────────────

  async getBookingRequests(userId: string): Promise<BookingRequest[]> {
    return db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.userId, userId))
      .orderBy(desc(bookingRequests.createdAt));
  }

  async createBookingRequest(data: InsertBookingRequest, userId: string): Promise<BookingRequest> {
    const [created] = await db
      .insert(bookingRequests)
      .values({ ...data, userId, status: "pending" })
      .returning();
    return created;
  }

  async updateBookingRequest(id: number, data: Partial<BookingRequest>): Promise<BookingRequest | undefined> {
    const [updated] = await db
      .update(bookingRequests)
      .set(data)
      .where(eq(bookingRequests.id, id))
      .returning();
    return updated;
  }

  async deleteBookingRequest(id: number): Promise<boolean> {
    const result = await db
      .delete(bookingRequests)
      .where(eq(bookingRequests.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Scheduler Settings ──────────────────────────────────────────────────────

  async getSchedulerSettings(userId: string): Promise<SchedulerSettings | undefined> {
    const [row] = await db
      .select()
      .from(schedulerSettings)
      .where(eq(schedulerSettings.userId, userId));
    return row;
  }

  async upsertSchedulerSettings(
    userId: string,
    data: Partial<Omit<SchedulerSettings, "userId" | "updatedAt">>
  ): Promise<SchedulerSettings> {
    const [row] = await db
      .insert(schedulerSettings)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: schedulerSettings.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

}

export const storage = new DatabaseStorage();
