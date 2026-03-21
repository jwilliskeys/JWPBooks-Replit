import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
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
  notes: text("notes"),
  photos: text("photos").array(),
  lastTuned: text("last_tuned"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  pianoId: integer("piano_id"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  servicesRequested: text("services_requested"),
  priceEstimate: text("price_estimate"),
  notes: text("notes"),
  isTuning: boolean("is_tuning").default(false),
  status: text("status").default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const calendarNotes = pgTable("calendar_notes", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
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

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
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

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Piano = typeof pianos.$inferSelect;
export type InsertPiano = z.infer<typeof insertPianoSchema>;
export type ServiceRecord = typeof serviceRecords.$inferSelect;
export type InsertServiceRecord = z.infer<typeof insertServiceRecordSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export const insertCalendarNoteSchema = createInsertSchema(calendarNotes).omit({
  id: true,
  createdAt: true,
});

export const insertTripSchema = createInsertSchema(trips).omit({
  id: true,
  createdAt: true,
});

export const insertTripAppointmentSchema = createInsertSchema(tripAppointments).omit({
  id: true,
  createdAt: true,
});

export type CalendarNote = typeof calendarNotes.$inferSelect;
export type InsertCalendarNote = z.infer<typeof insertCalendarNoteSchema>;
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type TripAppointment = typeof tripAppointments.$inferSelect;
export type InsertTripAppointment = z.infer<typeof insertTripAppointmentSchema>;

export * from "./models/auth";
