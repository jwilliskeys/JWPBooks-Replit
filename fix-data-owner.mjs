/**
 * JWP Books — One-time data ownership fix
 *
 * Run this once from your project folder:
 *   node --env-file=.env fix-data-owner.mjs
 *
 * What it does:
 *   1. Looks at all users and which one actually has your client data
 *   2. Finds the "owner" user tied to your email address
 *   3. Reassigns ALL data to that owner user so the app can see everything
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('\n🎹  JWP Books — Data Fix\n');

  // ── Step 1: Show all users ──────────────────────────────────────────────
  const usersResult = await pool.query(`
    SELECT
      u.id,
      u.email,
      (SELECT COUNT(*) FROM customers c WHERE c.user_id = u.id) AS customers,
      (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) AS appointments,
      (SELECT COUNT(*) FROM invoices i WHERE i.user_id = u.id) AS invoices,
      (SELECT COUNT(*) FROM trips t WHERE t.user_id = u.id) AS trips
    FROM users u
    ORDER BY customers DESC
  `);

  console.log('Users found in database:');
  console.table(usersResult.rows.map(r => ({
    id: r.id,
    email: r.email,
    customers: Number(r.customers),
    appointments: Number(r.appointments),
    invoices: Number(r.invoices),
  })));

  // ── Step 2: Show null-userId counts ────────────────────────────────────
  const nullResult = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id IS NULL) AS customers,
      (SELECT COUNT(*) FROM appointments WHERE user_id IS NULL) AS appointments,
      (SELECT COUNT(*) FROM invoices WHERE user_id IS NULL) AS invoices,
      (SELECT COUNT(*) FROM pianos p
        INNER JOIN customers c ON c.id = p.customer_id
        WHERE c.user_id IS NULL) AS pianos
  `);
  const nullCounts = nullResult.rows[0];
  console.log('\nRecords with no owner (user_id = NULL):');
  console.table([{
    customers: Number(nullCounts.customers),
    appointments: Number(nullCounts.appointments),
    invoices: Number(nullCounts.invoices),
  }]);

  // ── Step 3: Find the right owner user ──────────────────────────────────
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.error('❌  OWNER_EMAIL not set in .env');
    process.exit(1);
  }

  let ownerUser = usersResult.rows.find(u => u.email === ownerEmail);

  // If no user with that email exists, create one
  if (!ownerUser) {
    console.log(`\nNo user found for ${ownerEmail} — creating one...`);
    const newId = `owner-${Date.now()}`;
    const created = await pool.query(
      `INSERT INTO users (id, email, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *`,
      [newId, ownerEmail, 'John', 'Willis']
    );
    ownerUser = created.rows[0];
    ownerUser.customers = 0;
    console.log(`✅  Created user: ${ownerUser.id}`);
  }

  const ownerId = ownerUser.id;
  console.log(`\nOwner user: ${ownerId} (${ownerEmail})`);

  // ── Step 4: Find any OTHER user that has your real data ─────────────────
  const dataUser = usersResult.rows.find(
    r => r.id !== ownerId && Number(r.customers) > 0
  );

  if (!dataUser && Number(nullCounts.customers) === 0) {
    console.log('\n✅  Everything looks correct — your data is already under the right owner.');
    await pool.end();
    return;
  }

  console.log('\nReassigning data to your owner account...\n');

  let totalMoved = 0;

  // Reassign from another user if one has data
  if (dataUser) {
    const oldId = dataUser.id;
    console.log(`  Moving data from old user: ${oldId}`);

    const r1 = await pool.query(`UPDATE customers SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r2 = await pool.query(`UPDATE appointments SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r3 = await pool.query(`UPDATE invoices SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r4 = await pool.query(`UPDATE trips SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r5 = await pool.query(`UPDATE calendar_events SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r6 = await pool.query(`UPDATE calendar_notes SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r7 = await pool.query(`UPDATE mileage_logs SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r8 = await pool.query(`UPDATE business_expenses SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r9 = await pool.query(`UPDATE service_groups SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r10 = await pool.query(`UPDATE service_catalog SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);
    const r11 = await pool.query(`UPDATE inspections SET user_id = $1 WHERE user_id = $2`, [ownerId, oldId]);

    const moved = r1.rowCount + r2.rowCount + r3.rowCount + r4.rowCount +
      r5.rowCount + r6.rowCount + r7.rowCount + r8.rowCount +
      r9.rowCount + r10.rowCount + r11.rowCount;
    totalMoved += moved;
    console.log(`  ✅  Moved ${moved} records from old user`);
  }

  // Also claim any null-userId rows
  if (Number(nullCounts.customers) > 0 || Number(nullCounts.appointments) > 0) {
    console.log(`  Claiming null-userId records...`);
    const n1 = await pool.query(`UPDATE customers SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n2 = await pool.query(`UPDATE appointments SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n3 = await pool.query(`UPDATE invoices SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n4 = await pool.query(`UPDATE trips SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n5 = await pool.query(`UPDATE calendar_events SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n6 = await pool.query(`UPDATE calendar_notes SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n7 = await pool.query(`UPDATE mileage_logs SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n8 = await pool.query(`UPDATE business_expenses SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n9 = await pool.query(`UPDATE service_groups SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n10 = await pool.query(`UPDATE service_catalog SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);
    const n11 = await pool.query(`UPDATE inspections SET user_id = $1 WHERE user_id IS NULL`, [ownerId]);

    const moved = n1.rowCount + n2.rowCount + n3.rowCount + n4.rowCount +
      n5.rowCount + n6.rowCount + n7.rowCount + n8.rowCount +
      n9.rowCount + n10.rowCount + n11.rowCount;
    totalMoved += moved;
    console.log(`  ✅  Claimed ${moved} null-userId records`);
  }

  // ── Step 5: Verify ──────────────────────────────────────────────────────
  const verifyResult = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id = $1) AS customers,
      (SELECT COUNT(*) FROM appointments WHERE user_id = $1) AS appointments,
      (SELECT COUNT(*) FROM invoices WHERE user_id = $1) AS invoices
  `, [ownerId]);

  const v = verifyResult.rows[0];
  console.log('\n✅  Done! Your data is now accessible in the local app:');
  console.table([{
    clients: Number(v.customers),
    appointments: Number(v.appointments),
    invoices: Number(v.invoices),
  }]);

  console.log('\n  Restart the app with "bash start.sh" and your data will be there.\n');
  await pool.end();
}

run().catch(async err => {
  console.error('\n❌  Error:', err.message);
  await pool.end();
  process.exit(1);
});
