import { db } from "./db";
import { customers, pianos, serviceRecords, appointments } from "@shared/schema";
import { sql } from "drizzle-orm";
import seedData from "./seed-data.json";

export async function seedDatabaseIfEmpty() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(customers);

  if (Number(count) > 0) {
    console.log("Database already has data, skipping seed.");
    return;
  }

  console.log("Database is empty, seeding with data...");

  const idMap: Record<number, number> = {};

  for (const c of seedData.customers) {
    const [inserted] = await db.insert(customers).values({
      firstName: c.first_name,
      lastName: c.last_name,
      companyName: c.company_name || null,
      email: c.email || null,
      phone: c.phone || null,
      address: c.address || null,
      city: c.city || null,
      state: c.state || null,
      zipCode: c.zip_code || null,
      pianoType: c.piano_type || null,
      lastTuned: c.last_tuned || null,
      personalNotes: c.personal_notes || null,
      lastContacted: c.last_contacted || null,
    }).returning();
    idMap[c.id] = inserted.id;
  }

  console.log(`Seeded ${seedData.customers.length} customers`);

  const pianoIdMap: Record<number, number> = {};

  for (const p of seedData.pianos) {
    const customerId = idMap[p.customer_id];
    if (!customerId) continue;
    const [inserted] = await db.insert(pianos).values({
      customerId,
      make: p.make || null,
      model: p.model || null,
      pianoType: p.piano_type || null,
      year: p.year || null,
      notes: p.notes || null,
      photos: p.photos || null,
      lastTuned: p.last_tuned || null,
    }).returning();
    pianoIdMap[p.id] = inserted.id;
  }

  console.log(`Seeded ${seedData.pianos.length} pianos`);

  for (const sr of seedData.serviceRecords) {
    const customerId = idMap[sr.customer_id];
    if (!customerId) continue;
    const pianoId = sr.piano_id ? pianoIdMap[sr.piano_id] : null;
    await db.insert(serviceRecords).values({
      customerId,
      pianoId,
      serviceDate: sr.service_date,
      serviceType: sr.service_type,
      notes: sr.notes || null,
      cost: sr.cost || null,
    });
  }

  console.log(`Seeded ${seedData.serviceRecords.length} service records`);

  for (const a of seedData.appointments) {
    const customerId = idMap[a.customer_id];
    if (!customerId) continue;
    const pianoId = a.piano_id ? pianoIdMap[a.piano_id] : null;
    await db.insert(appointments).values({
      customerId,
      pianoId,
      date: a.date,
      time: a.time,
      servicesRequested: a.services_requested || null,
      priceEstimate: a.price_estimate || null,
      notes: a.notes || null,
      isTuning: a.is_tuning || false,
      status: a.status || "scheduled",
    });
  }

  console.log(`Seeded ${seedData.appointments.length} appointments`);

  await db.execute(sql`SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1))`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('pianos', 'id'), COALESCE((SELECT MAX(id) FROM pianos), 1))`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('service_records', 'id'), COALESCE((SELECT MAX(id) FROM service_records), 1))`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('appointments', 'id'), COALESCE((SELECT MAX(id) FROM appointments), 1))`);

  console.log("Database seeding complete! Sequences reset.");
}
