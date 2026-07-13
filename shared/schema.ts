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
  preferenceNotes: text("preference_notes"),
  clientType: text("client_type"),
  preferredTechnician: text("preferred_technician"),
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
  serviceItems: text("service_items"),
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
  endDate: text("end_date"),
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
  // "client" = regular piano-service billing (default). "falcetti" = the
  // biweekly Falcetti Pianos / BU paycheck — shown on income tracking but
  // completely excluded from SE-tax, income-tax, and sales-tax calculations.
  incomeSource: text("income_source").default("client"),
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
  isBilling: boolean("is_billing").default(false),
  doNotCall: boolean("do_not_call").default(false),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  notes: text("notes"),
  // Legacy column — kept nullable for old rows; do NOT write new values here.
  badges: text("badges"),
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
  receiptUrl: text("receipt_url"),
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
  // JSON array of date keys ("YYYY-M-D") for days the Falcetti work block is hidden
  workBlockExceptions: text("work_block_exceptions"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserSettings = typeof userSettings.$inferSelect;

// ── Inspections / Estimates ──────────────────────────────────────────────────

export const inspections = pgTable("inspections", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  customerId: integer("customer_id").notNull(),
  pianoId: integer("piano_id"),
  // "inspection" | "estimate"
  type: text("type").notNull().default("inspection"),
  inspectionDate: text("inspection_date").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | declined | converted
  // Piano condition
  overallCondition: text("overall_condition"), // excellent | good | fair | poor
  // Checklist items stored as JSON array of { item, status, notes }
  checklistItems: text("checklist_items").default("[]"),
  // Free-form findings
  findings: text("findings"),
  // Recommended services stored as JSON array of { service, estimatedCost }
  recommendedServices: text("recommended_services").default("[]"),
  estimatedTotal: text("estimated_total"),
  // If converted to an invoice
  invoiceId: integer("invoice_id"),
  // Customer-facing notes / summary
  summary: text("summary"),
  photos: text("photos").array(),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspections).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;

// ── Plaid Bank Feed ──────────────────────────────────────────────────────────

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  plaidItemId: text("plaid_item_id").notNull(),
  plaidAccessToken: text("plaid_access_token").notNull(),
  institutionName: text("institution_name"),
  accountName: text("account_name"),
  accountType: text("account_type"), // checking | savings | credit
  accountMask: text("account_mask"), // last 4 digits
  plaidAccountId: text("plaid_account_id").notNull(),
  cursor: text("cursor"), // Plaid transactions/sync cursor
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  bankAccountId: integer("bank_account_id").notNull(),
  plaidTransactionId: text("plaid_transaction_id").notNull(),
  date: text("date").notNull(),
  amount: text("amount").notNull(), // negative = debit, positive = credit
  description: text("description"),
  merchantName: text("merchant_name"),
  category: text("category"), // Plaid category
  businessTag: text("business_tag"), // "business" | "personal" | null (unreviewed)
  matchedInvoiceId: integer("matched_invoice_id"), // auto-matched invoice
  schedCCategory: text("sched_c_category"), // IRS Schedule C category if expense
  notes: text("notes"),
  pending: boolean("pending").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactions).omit({
  id: true,
  createdAt: true,
});

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;

// ── Outreach / Lead generation (Call-Center) ─────────────────────────────────

export const outreachLeads = pgTable("outreach_leads", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  // "church" | "teaching_studio" | "recording_studio" | "hotel_venue" | "school" | "other"
  leadType: text("lead_type").notNull().default("church"),
  city: text("city"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  // Date of most recent contact attempt (free text, e.g. "4/14/26")
  contactedDate: text("contacted_date"),
  // Date to follow up again — ISO "YYYY-MM-DD", used for overdue/upcoming reminders
  followUpDate: text("follow_up_date"),
  // "phone" | "email" | "both" | "in_person" | null
  contactMethod: text("contact_method"),
  // Outcome / status — free text, with UI presets. e.g. "Not contacted",
  // "Left voicemail", "Talked - interested", "Talked - not interested",
  // "Phone not in service", "Emailed - no reply", "Client"
  status: text("status").default("Not contacted"),
  pianoCount: text("piano_count"),
  currentTechnician: text("current_technician"),
  notes: text("notes"),
  // Optional geocoding for nearby-city recommendations / distance
  lat: text("lat"),
  lng: text("lng"),
  isStarred: boolean("is_starred").default(false),
  // "gemini" | "claude" | "manual" — where the lead came from
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOutreachLeadSchema = createInsertSchema(outreachLeads).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type OutreachLead = typeof outreachLeads.$inferSelect;
export type InsertOutreachLead = z.infer<typeof insertOutreachLeadSchema>;

export * from "./models/auth";

// ── Booking Requests (client-facing self-scheduling) ─────────────────────────

export const bookingRequests = pgTable("booking_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),          // owner (John) — set server-side
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  cityNeighborhood: text("city_neighborhood"),
  // Full address (from Google Places or manual entry)
  streetAddress: text("street_address"),
  addressLat: text("address_lat"),
  addressLng: text("address_lng"),
  // Service selection (from catalog)
  serviceRequested: text("service_requested"),
  pianoType: text("piano_type"),    // "Upright" | "Grand" | "Other"
  lastTuned: text("last_tuned"),    // approximate, free text
  preferredTimes: text("preferred_times"), // free text: preferred days/times + issues
  // Structured slot selection (what the client actually picked on the calendar)
  requestedDate: text("requested_date"),   // YYYY-MM-DD
  requestedTime: text("requested_time"),   // "4:00 PM"
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "declined"
  adminNotes: text("admin_notes"), // internal notes when approving/declining
  convertedCustomerId: integer("converted_customer_id"), // set when approved → customer created
  convertedAppointmentId: integer("converted_appointment_id"), // set when approved → appt created
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBookingRequestSchema = createInsertSchema(bookingRequests).omit({
  id: true,
  userId: true,
  status: true,
  adminNotes: true,
  convertedCustomerId: true,
  convertedAppointmentId: true,
  createdAt: true,
});

// Public-facing schema (subset used on the booking form)
export const publicBookingRequestSchema = insertBookingRequestSchema.extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  cityNeighborhood: z.string().optional(),
  streetAddress: z.string().optional(),
  addressLat: z.string().optional(),
  addressLng: z.string().optional(),
  serviceRequested: z.string().optional(),
  pianoType: z.enum([
    "Upright", "Grand", "Other",
    // "Other" refinements offered by the /book form's dropdown
    "Console", "Spinet", "Studio", "Digital", "Hybrid", "Harpsichord",
  ]).optional(),
  lastTuned: z.string().optional(),
  preferredTimes: z.string().optional(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  requestedTime: z.string().max(20).optional(),
});

export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = z.infer<typeof insertBookingRequestSchema>;

// ── Scheduler Settings (admin configuration for the self-scheduler) ───────────

export const schedulerSettings = pgTable("scheduler_settings", {
  userId: text("user_id").primaryKey(),
  // Behavior
  showServiceCost: boolean("show_service_cost").default(false),
  showServiceDuration: boolean("show_service_duration").default(true),
  completionRedirectUrl: text("completion_redirect_url"),
  // Service area (center lat/lng + radius in miles)
  serviceAreaLat: text("service_area_lat"),
  serviceAreaLng: text("service_area_lng"),
  serviceAreaRadiusMiles: text("service_area_radius_miles").default("40"),
  serviceAreaEnabled: boolean("service_area_enabled").default(false),
  // Page content
  welcomeMessage: text("welcome_message"),
  reservationCompleteMessage: text("reservation_complete_message"),
  outsideServiceAreaMessage: text("outside_service_area_message"),
  // Legal
  privacyPolicyUrl: text("privacy_policy_url"),
  termsOfServiceUrl: text("terms_of_service_url"),
  // Availability & booking rules (all nullable — server falls back to defaults)
  approvalMode: text("approval_mode").default("manual"), // "manual" | "auto"
  // JSON: { "0": { enabled, start: "09:00", end: "16:30" }, ... "6": ... } keyed by day-of-week (0=Sun)
  availabilityJson: text("availability_json"),
  slotDurationMinutes: integer("slot_duration_minutes").default(90),
  slotBufferMinutes: integer("slot_buffer_minutes").default(0),
  maxPerWeek: integer("max_per_week").default(2),
  bookingHorizonWeeks: integer("booking_horizon_weeks").default(12),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SchedulerSettings = typeof schedulerSettings.$inferSelect;

export const insertSchedulerSettingsSchema = createInsertSchema(schedulerSettings).omit({
  userId: true,
  updatedAt: true,
});
