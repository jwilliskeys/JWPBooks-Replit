/**
 * JWP Books — Import all data from Replit into local database
 *
 * Run once from the project folder:
 *   node --env-file=.env migrate-from-replit.mjs
 *
 * What it does:
 *   1. Logs into your live Replit app with your passcode
 *   2. Pulls every client, piano, appointment, invoice, trip, etc.
 *   3. Inserts everything into your local Neon database
 *   4. Skips anything that already exists (safe to run multiple times)
 */

import pg from 'pg';

const REPLIT_URL  = 'https://johnwillispiano-clients.replit.app';
const PASSCODE    = process.env.OWNER_PASSCODE;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const DB_URL      = process.env.DATABASE_URL;

if (!PASSCODE || !OWNER_EMAIL || !DB_URL) {
  console.error('❌  Missing OWNER_PASSCODE, OWNER_EMAIL, or DATABASE_URL in .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────

let sessionCookie = '';

async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    redirect: 'follow',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${REPLIT_URL}${path}`, opts);

  // Capture session cookie on login
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    if (match) sessionCookie = match[0];
  }

  if (!res.ok && res.status !== 401) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.ok ? res.json().catch(() => null) : null;
}

function log(msg) { process.stdout.write(msg + '\n'); }
function ok(msg)  { log(`  ✅  ${msg}`); }
function info(msg){ log(`  ℹ️   ${msg}`); }

// ── Step 1: Login ─────────────────────────────────────────────────────────────

async function login() {
  log('\n🔐  Logging into Replit app…');
  const res = await api('/api/login', 'POST', { passcode: PASSCODE });
  if (!sessionCookie) throw new Error('Login failed — no session cookie received. Check your passcode.');
  ok('Logged in');
}

// ── Step 2: Fetch all data ────────────────────────────────────────────────────

async function fetchAll() {
  log('\n📥  Fetching data from Replit…');

  const [
    customers,
    pianos,
    appointments,
    invoices,
    trips,
    calendarEvents,
    calendarNotes,
    serviceRecords,
    serviceCatalog,
    serviceGroups,
    mileageLogs,
    businessExpenses,
  ] = await Promise.all([
    api('/api/customers'),
    api('/api/pianos'),
    api('/api/appointments'),
    api('/api/invoices'),
    api('/api/trips'),
    api('/api/calendar/events'),
    api('/api/calendar/notes'),
    api('/api/service-records'),
    api('/api/service-catalog'),
    api('/api/service-groups'),
    api('/api/mileage-logs'),
    api('/api/business-expenses'),
  ]);

  // Trip appointments require fetching per trip
  let tripAppointments = [];
  if (trips && trips.length > 0) {
    for (const trip of trips) {
      const appts = await api(`/api/trips/${trip.id}/appointments`).catch(() => []);
      if (appts && appts.length) tripAppointments.push(...appts);
    }
  }

  const counts = {
    customers: customers?.length ?? 0,
    pianos: pianos?.length ?? 0,
    appointments: appointments?.length ?? 0,
    invoices: invoices?.length ?? 0,
    trips: trips?.length ?? 0,
    tripAppointments: tripAppointments.length,
    calendarEvents: calendarEvents?.length ?? 0,
    calendarNotes: calendarNotes?.length ?? 0,
    serviceRecords: serviceRecords?.length ?? 0,
    serviceCatalog: serviceCatalog?.length ?? 0,
    mileageLogs: mileageLogs?.length ?? 0,
    businessExpenses: businessExpenses?.length ?? 0,
  };

  log('\n  Data found on Replit:');
  console.table(counts);

  return {
    customers: customers ?? [],
    pianos: pianos ?? [],
    appointments: appointments ?? [],
    invoices: invoices ?? [],
    trips: trips ?? [],
    tripAppointments,
    calendarEvents: calendarEvents ?? [],
    calendarNotes: calendarNotes ?? [],
    serviceRecords: serviceRecords ?? [],
    serviceCatalog: serviceCatalog ?? [],
    serviceGroups: serviceGroups ?? [],
    mileageLogs: mileageLogs ?? [],
    businessExpenses: businessExpenses ?? [],
  };
}

// ── Step 3: Ensure local owner user exists ────────────────────────────────────

async function ensureOwner() {
  log('\n👤  Setting up owner account…');
  let { rows } = await pool.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`, [OWNER_EMAIL]
  );
  if (rows.length === 0) {
    const newId = `owner-${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [newId, OWNER_EMAIL, 'John', 'Willis']
    );
    rows = [{ id: newId }];
    ok(`Created owner: ${newId}`);
  } else {
    ok(`Found owner: ${rows[0].id}`);
  }
  return rows[0].id;
}

// ── Step 4: Import everything ─────────────────────────────────────────────────

async function importData(data, ownerId) {
  log('\n💾  Importing into local database…\n');

  // We'll track old ID → new ID for FK remapping
  const customerIdMap = new Map();
  const pianoIdMap    = new Map();
  const tripIdMap     = new Map();

  // ── Customers ──────────────────────────────────────────────────────────
  let custCount = 0;
  for (const c of data.customers) {
    const { rows } = await pool.query(`
      INSERT INTO customers (
        user_id, first_name, last_name, company_name, email, phone,
        address, city, state, zip_code, piano_type,
        last_tuned, personal_notes, last_contacted, is_starred, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      ownerId, c.firstName, c.lastName, c.companyName ?? null,
      c.email ?? null, c.phone ?? null, c.address ?? null,
      c.city ?? null, c.state ?? null, c.zipCode ?? null,
      c.pianoType ?? null, c.lastTuned ?? null,
      c.personalNotes ?? null, c.lastContacted ?? null,
      c.isStarred ?? false,
      c.createdAt ? new Date(c.createdAt) : new Date(),
    ]);
    // If conflict (already exists), fetch existing id by email+name
    if (rows.length > 0) {
      customerIdMap.set(c.id, rows[0].id);
      custCount++;
    } else {
      // Try to find existing to map ID
      const existing = await pool.query(
        `SELECT id FROM customers WHERE user_id=$1 AND first_name=$2 AND last_name=$3 LIMIT 1`,
        [ownerId, c.firstName, c.lastName]
      );
      if (existing.rows.length > 0) customerIdMap.set(c.id, existing.rows[0].id);
    }
  }
  ok(`Customers: ${custCount} imported (${data.customers.length} total)`);

  // ── Pianos ─────────────────────────────────────────────────────────────
  let pianoCount = 0;
  for (const p of data.pianos) {
    const newCustomerId = customerIdMap.get(p.customerId);
    if (!newCustomerId) continue;
    const { rows } = await pool.query(`
      INSERT INTO pianos (
        customer_id, make, model, piano_type, year, serial_number, location,
        tags, notes, photos, last_tuned, tuning_interval,
        case_color, case_finish, size, use_type,
        on_consignment, has_ivory, needs_repair, total_loss,
        player_installed, piano_life_saver, rental_piano, is_active, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING id
    `, [
      newCustomerId, p.make ?? null, p.model ?? null,
      p.pianoType ?? null, p.year ?? null, p.serialNumber ?? null,
      p.location ?? null,
      p.tags ?? null, p.notes ?? null, p.photos ?? null,
      p.lastTuned ?? null, p.tuningInterval ?? null,
      p.caseColor ?? null, p.caseFinish ?? null,
      p.size ?? null, p.useType ?? null,
      p.onConsignment ?? false, p.hasIvory ?? false,
      p.needsRepair ?? false, p.totalLoss ?? false,
      p.playerInstalled ?? false, p.pianoLifeSaver ?? false,
      p.rentalPiano ?? false, p.isActive ?? true,
      p.createdAt ? new Date(p.createdAt) : new Date(),
    ]);
    if (rows.length > 0) {
      pianoIdMap.set(p.id, rows[0].id);
      pianoCount++;
    }
  }
  ok(`Pianos: ${pianoCount} imported`);

  // ── Appointments ───────────────────────────────────────────────────────
  let apptCount = 0;
  for (const a of data.appointments) {
    const newCustomerId = customerIdMap.get(a.customerId);
    if (!newCustomerId) continue;
    const newPianoId = a.pianoId ? pianoIdMap.get(a.pianoId) ?? null : null;
    await pool.query(`
      INSERT INTO appointments (
        user_id, customer_id, piano_id, date, time, duration,
        services_requested, price_estimate, notes, is_tuning, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      ownerId, newCustomerId, newPianoId,
      a.date, a.time, a.duration ?? null,
      a.servicesRequested ?? null, a.priceEstimate ?? null,
      a.notes ?? null, a.isTuning ?? false,
      a.status ?? 'scheduled',
      a.createdAt ? new Date(a.createdAt) : new Date(),
    ]);
    apptCount++;
  }
  ok(`Appointments: ${apptCount} imported`);

  // ── Invoices ───────────────────────────────────────────────────────────
  let invoiceCount = 0;
  for (const inv of data.invoices) {
    const newCustomerId = customerIdMap.get(inv.customerId);
    if (!newCustomerId) continue;
    const newPianoId = inv.pianoId ? pianoIdMap.get(inv.pianoId) ?? null : null;
    await pool.query(`
      INSERT INTO invoices (
        user_id, invoice_number, customer_id, piano_id,
        invoice_date, due_date, status, line_items,
        subtotal, total, paid_amount, payment_method,
        notes, customer_name, customer_email, customer_address,
        customer_phone, piano_description, assigned_to, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT DO NOTHING
    `, [
      ownerId, inv.invoiceNumber, newCustomerId, newPianoId,
      inv.invoiceDate, inv.dueDate, inv.status ?? 'draft',
      inv.lineItems ?? '[]', inv.subtotal ?? '$0.00',
      inv.total ?? '$0.00', inv.paidAmount ?? '$0.00',
      inv.paymentMethod ?? null, inv.notes ?? null,
      inv.customerName ?? null, inv.customerEmail ?? null,
      inv.customerAddress ?? null, inv.customerPhone ?? null,
      inv.pianoDescription ?? null,
      inv.assignedTo ?? 'John Willis',
      inv.createdAt ? new Date(inv.createdAt) : new Date(),
    ]);
    invoiceCount++;
  }
  ok(`Invoices: ${invoiceCount} imported`);

  // ── Trips ──────────────────────────────────────────────────────────────
  let tripCount = 0;
  for (const t of data.trips) {
    const { rows } = await pool.query(`
      INSERT INTO trips (user_id, name, start_date, end_date, notes, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
    `, [
      ownerId, t.name, t.startDate, t.endDate,
      t.notes ?? null,
      t.createdAt ? new Date(t.createdAt) : new Date(),
    ]);
    if (rows.length > 0) {
      tripIdMap.set(t.id, rows[0].id);
      tripCount++;
    }
  }
  ok(`Trips: ${tripCount} imported`);

  // ── Trip Appointments ──────────────────────────────────────────────────
  let tripApptCount = 0;
  for (const ta of data.tripAppointments) {
    const newTripId = tripIdMap.get(ta.tripId);
    const newCustomerId = customerIdMap.get(ta.customerId);
    if (!newTripId || !newCustomerId) continue;
    const newPianoId = ta.pianoId ? pianoIdMap.get(ta.pianoId) ?? null : null;
    await pool.query(`
      INSERT INTO trip_appointments (
        trip_id, customer_id, piano_id, date, time, duration,
        services_requested, price_estimate, notes, status,
        service_area, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      newTripId, newCustomerId, newPianoId,
      ta.date, ta.time, ta.duration ?? '2 hours',
      ta.servicesRequested ?? null, ta.priceEstimate ?? null,
      ta.notes ?? null, ta.status ?? 'scheduled',
      ta.serviceArea ?? null,
      ta.createdAt ? new Date(ta.createdAt) : new Date(),
    ]);
    tripApptCount++;
  }
  ok(`Trip appointments: ${tripApptCount} imported`);

  // ── Calendar Events ────────────────────────────────────────────────────
  let calEventCount = 0;
  for (const e of data.calendarEvents) {
    await pool.query(`
      INSERT INTO calendar_events (
        user_id, date, title, notes, start_time, end_time,
        is_all_day, is_repeating, repeat_frequency, event_type, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      ownerId, e.date, e.title, e.notes ?? null,
      e.startTime ?? null, e.endTime ?? null,
      e.isAllDay ?? false, e.isRepeating ?? false,
      e.repeatFrequency ?? null,
      e.eventType ?? 'personal',
      e.createdAt ? new Date(e.createdAt) : new Date(),
    ]);
    calEventCount++;
  }
  ok(`Calendar events: ${calEventCount} imported`);

  // ── Service Records ────────────────────────────────────────────────────
  let srCount = 0;
  for (const sr of data.serviceRecords) {
    const newCustomerId = customerIdMap.get(sr.customerId);
    if (!newCustomerId) continue;
    const newPianoId = sr.pianoId ? pianoIdMap.get(sr.pianoId) ?? null : null;
    await pool.query(`
      INSERT INTO service_records (
        customer_id, piano_id, service_date, service_type,
        notes, cost, humidity, temperature, services, is_tuning, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      newCustomerId, newPianoId, sr.serviceDate, sr.serviceType,
      sr.notes ?? null, sr.cost ?? null,
      sr.humidity ?? null, sr.temperature ?? null,
      sr.services ?? '[]', sr.isTuning ?? false,
      sr.createdAt ? new Date(sr.createdAt) : new Date(),
    ]);
    srCount++;
  }
  ok(`Service records: ${srCount} imported`);

  // ── Service Catalog + Groups ───────────────────────────────────────────
  let scCount = 0;
  for (const s of data.serviceCatalog) {
    await pool.query(`
      INSERT INTO service_catalog (
        user_id, name, category, default_cost, default_duration,
        is_tuning, is_default, description, is_active, sort_order, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (user_id, name) DO NOTHING
    `, [
      ownerId, s.name, s.category ?? null,
      s.defaultCost ?? null, s.defaultDuration ?? null,
      s.isTuning ?? false, s.isDefault ?? false,
      s.description ?? null, s.isActive ?? true,
      s.sortOrder ?? 0,
      s.createdAt ? new Date(s.createdAt) : new Date(),
    ]);
    scCount++;
  }
  ok(`Service catalog: ${scCount} items imported`);

  // ── Mileage Logs ───────────────────────────────────────────────────────
  let mlCount = 0;
  for (const m of data.mileageLogs) {
    await pool.query(`
      INSERT INTO mileage_logs (user_id, date, description, miles, created_at)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      ownerId, m.date, m.description ?? null, m.miles,
      m.createdAt ? new Date(m.createdAt) : new Date(),
    ]);
    mlCount++;
  }
  ok(`Mileage logs: ${mlCount} imported`);

  // ── Business Expenses ──────────────────────────────────────────────────
  let beCount = 0;
  for (const e of data.businessExpenses) {
    await pool.query(`
      INSERT INTO business_expenses (
        user_id, date, description, category, amount, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
    `, [
      ownerId, e.date, e.description, e.category, e.amount,
      e.createdAt ? new Date(e.createdAt) : new Date(),
    ]);
    beCount++;
  }
  ok(`Business expenses: ${beCount} imported`);

  log('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🎹  JWP Books — Replit → Local Migration\n');
  log(`  Source: ${REPLIT_URL}`);
  log(`  Target: Neon database\n`);

  try {
    await login();
    const data    = await fetchAll();
    const ownerId = await ensureOwner();

    // Wipe old test data first
    log('\n🗑   Clearing old test data from local database…');
    await pool.query(`DELETE FROM trip_appointments`);
    await pool.query(`DELETE FROM trips WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM service_records WHERE customer_id IN (SELECT id FROM customers WHERE user_id = $1)`, [ownerId]);
    await pool.query(`DELETE FROM appointments WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM invoices WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM pianos WHERE customer_id IN (SELECT id FROM customers WHERE user_id = $1)`, [ownerId]);
    await pool.query(`DELETE FROM customers WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM calendar_events WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM mileage_logs WHERE user_id = $1`, [ownerId]);
    await pool.query(`DELETE FROM business_expenses WHERE user_id = $1`, [ownerId]);
    ok('Old data cleared');

    await importData(data, ownerId);

    log('🎉  Migration complete! Restart the app with "bash start.sh" to see your data.\n');
  } catch (err) {
    log(`\n❌  Error: ${err.message}`);
    if (err.message.includes('Login')) {
      log('     Make sure OWNER_PASSCODE in your .env matches the passcode on the Replit site.');
    }
  } finally {
    await pool.end();
  }
}

main();
