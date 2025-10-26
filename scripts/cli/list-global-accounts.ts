#!/usr/bin/env node
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../../server/.env');
dotenv.config({ path: ENV_PATH });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

const filter = process.argv[2]?.toLowerCase();

async function main() {
  const client = await pool.connect();
  try {
    const sql = `
      SELECT id, ga_code, ga_name, ga_type, fs_type
      FROM global_accounts
      ORDER BY fs_type, ga_type, ga_code
    `;
    const result = await client.query(sql);
    const rows = result.rows.filter((row) =>
      filter
        ? row.ga_code.toLowerCase().includes(filter) ||
          row.ga_name.includes(filter)
        : true
    );
    for (const row of rows) {
      console.log(
        `${row.fs_type}\t${row.ga_type}\t${row.ga_code}\t${row.ga_name}`
      );
    }
    if (!rows.length) {
      console.log('No rows matched filter.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
