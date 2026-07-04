import pg from 'pg';

// SECURITY: never hardcode credentials here — this file is tracked in git.
// Run with: set -a && source .env && set +a && node create_user.mjs
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Source your .env first.');
  process.exit(1);
}
const client = new pg.Client(dbUrl);

(async () => {
  try {
    await client.connect();
    
    // Check if user already exists
    const checkResult = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['j.willis.keys@gmail.com']
    );
    
    if (checkResult.rows.length > 0) {
      console.log('User already exists:', checkResult.rows[0].id);
      await client.end();
      return;
    }
    
    // Create new user
    const userId = 'owner-' + Date.now();
    const result = await client.query(
      `INSERT INTO users (id, email, "firstName", "lastName", "profileImageUrl", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, email`,
      [userId, 'j.willis.keys@gmail.com', 'Willis', 'Krammer', null]
    );
    
    console.log('User created successfully:', result.rows[0]);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
})();
