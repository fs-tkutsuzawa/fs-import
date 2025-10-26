// server/test/db-inspect.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  const client = await pool.connect();

  try {
    console.log('--- Connection Info ---');
    const version = await client.query('SELECT version()');
    const currentDb = await client.query('SELECT current_database()');
    const currentUser = await client.query('SELECT current_user');
    console.log('version:', version.rows[0].version);
    console.log('database:', currentDb.rows[0].current_database);
    console.log('user:', currentUser.rows[0].current_user);

    console.log('\n--- Tables in public schema ---');
    const tableResult = await client.query<{
      table_name: string;
    }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

    if (tableResult.rows.length === 0) {
      console.log('public スキーマにテーブルが存在しません');
      return;
    }

    const tableNames = tableResult.rows.map((row) => row.table_name);
    tableNames.forEach((name) => console.log('-', name));

    for (const tableName of tableNames) {
      console.log(`\n=== Schema: ${tableName} ===`);

      const columns = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: 'YES' | 'NO';
        column_default: string | null;
        udt_name: string;
        character_maximum_length: number | null;
        numeric_precision: number | null;
        numeric_scale: number | null;
      }>(
        `
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default,
            udt_name,
            character_maximum_length,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
          ORDER BY ordinal_position
        `,
        [tableName]
      );

      columns.rows.forEach((col) => {
        const parts = [
          `- ${col.column_name}`,
          `type=${col.data_type}`,
          col.udt_name && col.udt_name !== col.data_type
            ? `udt=${col.udt_name}`
            : null,
          col.character_maximum_length
            ? `len=${col.character_maximum_length}`
            : null,
          col.numeric_precision ? `precision=${col.numeric_precision}` : null,
          col.numeric_scale !== null ? `scale=${col.numeric_scale}` : null,
          `nullable=${col.is_nullable}`,
          col.column_default ? `default=${col.column_default}` : null,
        ].filter(Boolean);
        console.log(parts.join(' | '));
      });

      // Row count
      try {
        const countResult = await client.query(
          `SELECT COUNT(*)::bigint AS count FROM ${tableName}`
        );
        console.log(`rows=${countResult.rows[0].count}`);
      } catch (err) {
        console.log(
          `rows=(件数取得失敗)`,
          err instanceof Error ? err.message : err
        );
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('DB inspect failed:', error);
  process.exit(1);
});
