import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function checkSchema() {
  const client = await pool.connect();

  try {
    // Check user_accounts table structure
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_accounts'
      ORDER BY ordinal_position
    `);

    console.log('user_accounts table columns:');
    console.log('================================');
    result.rows.forEach((col) => {
      console.log(
        `${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`
      );
    });

    // Check global_accounts columns
    const gaResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns
      WHERE table_name = 'global_accounts'
      ORDER BY ordinal_position
    `);

    console.log('\nglobal_accounts table columns:');
    console.log('================================');
    gaResult.rows.forEach((col) => {
      console.log(`${col.column_name}: ${col.data_type}`);
    });

    // Get sample global accounts
    const sampleGA = await client.query(`
      SELECT id, ga_name, ga_type, fs_type
      FROM global_accounts
      WHERE fs_type = 'PL'
      LIMIT 3
    `);

    console.log('\nSample global accounts:');
    console.log('================================');
    sampleGA.rows.forEach((ga) => {
      console.log(`${ga.id}: ${ga.ga_name} (${ga.ga_type}, ${ga.fs_type})`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema();
