// CFO snapshot (plain JS, no TypeScript/tsx/esbuild) — pulls live numbers out of
// the JWP Books Neon database so the "jwp" scheduled task can ground its CFO
// analysis in real data instead of just being a static prompt.
//
// Deliberately NOT a .ts file run through tsx: this project's node_modules
// contains macOS-native esbuild binaries, so tsx/esbuild-based execution fails
// with a platform mismatch on Linux runners. Plain Node + the pure-JS `pg`
// driver has no native-binary dependency and runs anywhere.
//
// Usage:
//   set -a && source .env && set +a && node scripts/cfo-snapshot.mjs
// Prints one JSON object to stdout.
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ error: "DATABASE_URL is not set. Source .env first." }));
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function getMonthsSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function classify(state, city) {
  const stateUp = (state ?? "").toUpperCase();
  if (["MA", "RI", "CT", "NH", "ME", "VT", "VA"].includes(stateUp)) return "boston";
  if (stateUp === "UT") return "slc";
  const cityLow = (city ?? "").toLowerCase();
  if (cityLow.includes("boston")) return "boston";
  if (["davis", "salt lake", "south jordan", "centerville"].some((c) => cityLow.includes(c))) return "slc";
  return "other";
}

function parseDollar(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// Runs a query and returns [] (plus a note) instead of crashing the whole
// snapshot if a column is missing — e.g. follow_up_date won't exist until
// `npm run db:push` has been run on the schema change that added it.
async function safeQuery(sql, label, notes) {
  try {
    const res = await pool.query(sql);
    return res.rows;
  } catch (err) {
    notes.push(`${label}: query failed (${err.message}) — likely a pending \`npm run db:push\`. Skipped.`);
    return [];
  }
}

async function main() {
  const notes = [];
  const [customers, allInvoices, allAppointments, allLeads, allExpenses] = await Promise.all([
    safeQuery("SELECT id, first_name, last_name, city, state, last_tuned FROM customers", "customers", notes),
    safeQuery("SELECT id, status, total, paid_amount, invoice_date FROM invoices", "invoices", notes),
    safeQuery("SELECT id, date, status FROM appointments", "appointments", notes),
    safeQuery("SELECT id, name, status, follow_up_date FROM outreach_leads", "outreach_leads", notes),
    safeQuery("SELECT id, date, amount FROM business_expenses", "business_expenses", notes),
  ]);

  const overdueBoston = customers.filter((c) => {
    if (classify(c.state, c.city) !== "boston") return false;
    const m = getMonthsSince(c.last_tuned);
    return m !== null && m >= 6;
  });
  const overdueSlc = customers.filter((c) => {
    if (classify(c.state, c.city) !== "slc") return false;
    const m = getMonthsSince(c.last_tuned);
    return m !== null && m >= 6;
  });

  const unpaidInvoices = allInvoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + parseDollar(i.total), 0);
  const draftInvoices = allInvoices.filter((i) => i.status === "draft");

  const today = todayISO();
  const followUpsOverdue = allLeads.filter((l) => l.follow_up_date && l.follow_up_date <= today && l.status !== "Client");
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const followUpsUpcoming7d = allLeads.filter((l) => {
    if (!l.follow_up_date || l.follow_up_date <= today) return false;
    const d = new Date(l.follow_up_date);
    return d <= in7;
  });

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const matchesYM = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === ym;
  };

  const revenueThisMonth = allInvoices
    .filter((i) => i.status === "paid" && matchesYM(i.invoice_date))
    .reduce((sum, i) => sum + parseDollar(i.paid_amount || i.total), 0);

  const expensesThisMonth = allExpenses
    .filter((e) => matchesYM(e.date))
    .reduce((sum, e) => sum + parseDollar(e.amount), 0);

  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const upcomingAppts = allAppointments.filter((a) => {
    const d = new Date(a.date);
    if (isNaN(d.getTime())) return false;
    return d >= now && d <= in14 && a.status !== "completed" && a.status !== "cancelled";
  }).length;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    notes,
    customers: { total: customers.length, overdueBostonCount: overdueBoston.length, overdueSlcCount: overdueSlc.length },
    overdueBoston: overdueBoston.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, lastTuned: c.last_tuned, city: c.city, state: c.state })),
    overdueSlc: overdueSlc.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, lastTuned: c.last_tuned, city: c.city, state: c.state })),
    invoices: {
      total: allInvoices.length,
      unpaidCount: unpaidInvoices.length,
      unpaidTotal: unpaidTotal.toFixed(2),
      draftCount: draftInvoices.length,
      revenueThisMonth: revenueThisMonth.toFixed(2),
    },
    expenses: { thisMonth: expensesThisMonth.toFixed(2) },
    appointments: { upcoming14d: upcomingAppts },
    outreach: {
      totalLeads: allLeads.length,
      followUpsOverdueCount: followUpsOverdue.length,
      followUpsOverdue: followUpsOverdue.map((l) => ({ id: l.id, name: l.name, followUpDate: l.follow_up_date, status: l.status })),
      followUpsUpcoming7dCount: followUpsUpcoming7d.length,
    },
  };

  console.log(JSON.stringify(snapshot, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ error: String(err?.message ?? err) }));
  await pool.end();
  process.exit(1);
});
