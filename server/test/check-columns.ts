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

async function checkColumns() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns
      WHERE table_name = 'calculation_rules'
      ORDER BY ordinal_position
    `);

    console.log('calculation_rules columns:');
    result.rows.forEach((col) => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumns();
