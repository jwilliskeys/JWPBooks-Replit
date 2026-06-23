// Falcetti Pianos (BU Head Technician) biweekly paycheck — auto-creates a paid
// invoice for every 2nd Friday starting 2026-01-09, so it shows up in income
// tracking without manual entry.
//
// Plain JS (no TypeScript/tsx/esbuild) for the same reason as cfo-snapshot.mjs:
// this project's node_modules carries macOS-native esbuild binaries, so
// tsx/esbuild-based execution fails with a platform mismatch on Linux runners.
// Plain Node + the pure-JS `pg` driver has no native-binary dependency and runs
// anywhere — including from the biweekly scheduled task.
//
// Idempotent + self-healing: walks every payday from the anchor date through
// today and fills in any that are missing an invoice. Safe to run repeatedly,
// on non-paydays, or after a missed run (e.g. the app was closed on a Friday).
//
// Amount: defaults to whatever the most recent Falcetti invoice was for. If
// Willis gets a raise, he edits one invoice's total and every future
// auto-created paycheck picks up the new amount automatically. Falls back to
// $1,532.00 only if no Falcetti invoice exists yet at all.
//
// Usage:
//   set -a && source .env && set +a && node scripts/falcetti-paycheck.mjs
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ error: "DATABASE_URL is not set. Source .env first." }));
  process.exit(1);
}

const ANCHOR = new Date(2026, 0, 9); // Jan 9, 2026 — first Falcetti paycheck (Friday)
const DEFAULT_AMOUNT = 1532;
const CUSTOMER_FIRST_NAME = "Falcetti";
const CUSTOMER_LAST_NAME = "Pianos (Payroll)";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function mdyy(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function parseDollar(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// All paydays (every 14 days from the anchor) up to and including today.
function paydaysThrough(today) {
  const days = [];
  const cur = new Date(ANCHOR);
  while (cur <= today) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 14);
  }
  return days;
}

async function getOrCreateFalcettiCustomer(userId) {
  const existing = await pool.query(
    `SELECT id FROM customers WHERE first_name = $1 AND last_name = $2 LIMIT 1`,
    [CUSTOMER_FIRST_NAME, CUSTOMER_LAST_NAME]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO customers (user_id, first_name, last_name, company_name, client_type, personal_notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      userId,
      CUSTOMER_FIRST_NAME,
      CUSTOMER_LAST_NAME,
      "Falcetti Pianos",
      "Employer — not a client",
      "Payroll placeholder record for the biweekly Falcetti Pianos / BU Head Technician paycheck. Auto-created so paychecks can be logged as invoices for income tracking. Not a real piano-service client — no address/city/state on purpose so it never shows up in overdue-tuning or regional revenue logic.",
    ]
  );
  return inserted.rows[0].id;
}

async function main() {
  const userRow = await pool.query(`SELECT DISTINCT user_id FROM customers WHERE user_id IS NOT NULL LIMIT 1`);
  const userId = userRow.rows[0]?.user_id;
  if (!userId) {
    console.error(JSON.stringify({ error: "Could not determine userId from existing customers." }));
    await pool.end();
    process.exit(1);
  }

  const falcettiCustomerId = await getOrCreateFalcettiCustomer(userId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paydays = paydaysThrough(today);

  const existingRes = await pool.query(
    `SELECT invoice_date FROM invoices WHERE customer_id = $1 AND income_source = 'falcetti'`,
    [falcettiCustomerId]
  );
  const existingDates = new Set(existingRes.rows.map((r) => r.invoice_date));

  const lastInvoiceRes = await pool.query(
    `SELECT total FROM invoices WHERE customer_id = $1 AND income_source = 'falcetti'
     ORDER BY id DESC LIMIT 1`,
    [falcettiCustomerId]
  );
  let lastAmount = lastInvoiceRes.rows.length > 0 ? parseDollar(lastInvoiceRes.rows[0].total) : DEFAULT_AMOUNT;

  const maxNumRes = await pool.query(
    `SELECT MAX(CAST(invoice_number AS INTEGER)) AS max FROM invoices WHERE invoice_number ~ '^[0-9]+$'`
  );
  let nextNumber = (maxNumRes.rows[0].max ?? 0) + 1;

  const created = [];
  for (const payday of paydays) {
    const dateStr = mdyy(payday);
    if (existingDates.has(dateStr)) continue;

    const amount = lastAmount; // carries forward the most recent known amount
    const lineItems = JSON.stringify([
      { description: "Falcetti Pianos paycheck (BU Head Technician)", quantity: 1, unitPrice: amount },
    ]);

    await pool.query(
      `INSERT INTO invoices (
         user_id, invoice_number, customer_id, invoice_date, due_date, status,
         line_items, subtotal, total, paid_amount, payment_method, notes,
         customer_name, income_source
       ) VALUES ($1,$2,$3,$4,$5,'paid',$6,$7,$8,$9,'Direct deposit',$10,$11,'falcetti')`,
      [
        userId,
        String(nextNumber),
        falcettiCustomerId,
        dateStr,
        dateStr,
        lineItems,
        formatMoney(amount),
        formatMoney(amount),
        formatMoney(amount),
        "Auto-created biweekly Falcetti Pianos paycheck. Tax-exempt — excluded from SE tax, income tax, and sales tax tracking.",
        `${CUSTOMER_FIRST_NAME} ${CUSTOMER_LAST_NAME}`,
      ]
    );
    created.push({ invoiceNumber: String(nextNumber), date: dateStr, amount: formatMoney(amount) });
    nextNumber += 1;
  }

  console.log(JSON.stringify({ falcettiCustomerId, createdCount: created.length, created }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ error: String(err?.message ?? err) }));
  await pool.end();
  process.exit(1);
});
