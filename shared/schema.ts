import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, serial, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  pianoType: text("piano_type"),
  lastTuned: text("last_tuned"),
  personalNotes: text("personal_notes"),
  lastContacted: text("last_contacted"),
  isStarred: boolean("is_starred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pianos = pgTable("pianos", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  make: text("make"),
  model: text("model"),
  pianoType: text("piano_type"),
  year: text("year"),
  serialNumber: text("serial_number"),
  location: text("location"),
  tags: text("tags").array(),
  notes: text("notes"),
  photos: text("photos").array(),
  lastTuned: text("last_tuned"),
  tuningInterval: text("tuning_interval"),
  caseColor: text("case_color"),
  caseFinish: text("case_finish"),
  size: text("size"),
  useType: text("use_type"),
  onConsignment: boolean("on_consignment").default(false),
  hasIvory: boolean("has_ivory").default(false),
  needsRepair: boolean("needs_repair").default(false),
  totalLoss: boolean("total_loss").default(false),
  playerInstalled: boolean("player_installed").default(false),
  pianoLifeSaver: boolean("piano_life_saver").default(false),
  rentalPiano: boolean("rental_piano").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceRecords = pgTable("service_records", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  pianoId: integer("piano_id"),
  serviceDate: text("service_date").notNull(),
  serviceType: text("service_type").notNull(),
  notes: text("notes"),
  cost: text("cost"),
  humidity: text("humidity"),
  temperature: text("temperature"),
  services: text("services").default("[]"),
  isTuning: boolean("is_tuning").default(false),
  appointmentId: integer("appointment_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceGroups = pgTable("service_groups", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [unique("service_groups_user_name_unique").on(table.userId, table.name)]);

export const serviceCatalog = pgTable("service_catalog", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  category: text("category"),
  defaultCost: text("default_cost"),
  defaultDuration: text("default_duration"),
  isTuning: boolean("is_tuning").default(false),
  isDefault: boolean("is_default").default(false),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [unique("service_catalog_user_name_unique").on(table.userId, table.name)]);

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  customerId: integer("customer_id").notNull(),
  pianoId: integer("piano_id"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  duration: text("duration"),
  servicesRequested: text("services_requested"),
  priceEstimate: text("price_estimate"),
  notes: text("notes"),
  isTuning: boolean("is_tuning").default(false),
  status: text("status").default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calendarNotes = pgTable("calendar_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  date: text("date").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  date: text("date").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  isAllDay: boolean("is_all_day").default(false),
  isRepeating: boolean("is_repeating").default(false),
  repeatFrequency: text("repeat_frequency"),
  repeatEndDate: text("repeat_end_date"),
  eventType: text("event_type").notNull().default("personal"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tripAppointments = pgTable("trip_appointments", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull(),
  customerId: integer("customer_id").notNull(),
  pianoId: integer("piano_id"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  duration: text("duration").default("2 hours"),
  servicesRequested: text("services_requested"),
  priceEstimate: text("price_estimate"),
  notes: text("notes"),
  status: text("status").default("scheduled"),
  serviceArea: text("service_area"),
  linkedAppointmentId: integer("linked_appointment_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: integer("customer_id").notNull(),
  appointmentId: integer("appointment_id"),
  pianoId: integer("piano_id"),
  invoiceDate: text("invoice_date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").default("draft"),
  lineItems: text("line_items").notNull().default("[]"),
  subtotal: text("subtotal").default("$0.00"),
  total: text("total").default("$0.00"),
  paidAmount: text("paid_amount").default("$0.00"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  customerPhone: text("customer_phone"),
  pianoDescription: text("piano_description"),
  assignedTo: text("assigned_to").default("John Willis"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerContacts = pgTable("customer_contacts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  customerId: integer("customer_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  role: text("role"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerContactSchema = createInsertSchema(customerContacts).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = z.infer<typeof insertCustomerContactSchema>;

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertPianoSchema = createInsertSchema(pianos).omit({
  id: true,
  createdAt: true,
});

export const insertServiceRecordSchema = createInsertSchema(serviceRecords).omit({
  id: true,
  createdAt: true,
});

export const insertServiceGroupSchema = createInsertSchema(serviceGroups).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertServiceCatalogSchema = createInsertSchema(serviceCatalog).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Piano = typeof pianos.$inferSelect;
export type InsertPiano = z.infer<typeof insertPianoSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type ServiceGroup = typeof serviceGroups.$inferSelect;
export type InsertServiceGroup = z.infer<typeof insertServiceGroupSchema>;
export type ServiceCatalogItem = typeof serviceCatalog.$inferSelect;
export type InsertServiceCatalogItem = z.infer<typeof insertServiceCatalogSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export const insertCalendarNoteSchema = createInsertSchema(calendarNotes).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  eventType: z.enum(["personal", "memo"]).default("personal"),
  repeatFrequency: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertTripAppointmentSchema = createInsertSchema(tripAppointments).omit({
  id: true,
  createdAt: true,
});

export type CalendarNote = typeof calendarNotes.$inferSelect;
export type InsertCalendarNote = z.infer<typeof insertCalendarNoteSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type TripAppointment = typeof tripAppointments.$inferSelect;
export type InsertTripAppointment = z.infer<typeof insertTripAppointmentSchema>;

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export const mileageLogs = pgTable("mileage_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  date: text("date").notNull(),
  description: text("description"),
  miles: text("miles").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const businessExpenses = pgTable("business_expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  date: text("date").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amount: text("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMileageLogSchema = createInsertSchema(mileageLogs).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertBusinessExpenseSchema = createInsertSchema(businessExpenses).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type MileageLog = typeof mileageLogs.$inferSelect;
export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type InsertBusinessExpense = z.infer<typeof insertBusinessExpenseSchema>;

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  zelleHandle: text("zelle_handle"),
  paypalMe: text("paypal_me"),
  venmoHandle: text("venmo_handle"),
  cashAppHandle: text("cash_app_handle"),
  stripePaymentLink: text("stripe_payment_link"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserSettings = typeof userSettings.$inferSelect;

export * from "./models/auth";
