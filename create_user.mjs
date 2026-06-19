import pg from 'pg';

const dbUrl = 'postgresql://neondb_owner:npg_PN0cXzRHtQh2@ep-twilight-hat-apxn7qn0.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require';
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
