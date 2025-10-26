#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import dotenv from 'dotenv';

type FsType = 'PL' | 'BS' | 'CF' | 'PPE';
type GaType = 'super_calc' | 'aggregate';

type MissingAccountRow = {
  global_account_id: string;
  ga_name: string;
  ga_code: string;
  ga_type: GaType;
  ga_fs_type: FsType;
  ga_is_credit: boolean | null;
};

type CliOptions = {
  dryRun: boolean;
  fsType?: FsType;
  gaType?: GaType;
  gaCode?: string;
};

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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--fs-type=')) {
      const value = arg.split('=')[1]?.toUpperCase();
      if (value && ['PL', 'BS', 'CF', 'PPE'].includes(value)) {
        options.fsType = value as FsType;
      } else {
        throw new Error(
          `Invalid fs-type "${value}". Use one of PL, BS, CF, PPE.`
        );
      }
    } else if (arg.startsWith('--ga-type=')) {
      const value = arg.split('=')[1];
      if (value === 'super_calc' || value === 'aggregate') {
        options.gaType = value;
      } else {
        throw new Error(
          `Invalid ga-type "${value}". Use "super_calc" or "aggregate".`
        );
      }
    } else if (arg.startsWith('--ga-code=')) {
      const value = arg.split('=')[1];
      if (value) {
        options.gaCode = value;
      }
    } else {
      console.warn(`[sync-ua] Unknown argument ignored: ${arg}`);
    }
  }

  return options;
}

async function fetchMissingAccounts(
  client: PoolClient,
  options: CliOptions
): Promise<MissingAccountRow[]> {
  const conditions: string[] = ["source = 'GLOBAL_ONLY'"];
  const params: unknown[] = [];

  if (options.fsType) {
    params.push(options.fsType);
    conditions.push(`ga_fs_type = $${params.length}`);
  }

  if (options.gaType) {
    params.push(options.gaType);
    conditions.push(`ga_type = $${params.length}`);
  }

  if (options.gaCode) {
    params.push(options.gaCode);
    conditions.push(`ga_code = $${params.length}`);
  }

  const sql = `
    SELECT global_account_id,
           ga_name,
           ga_code,
           ga_type,
           ga_fs_type,
           ga_is_credit
      FROM integrated_accounts_view
     WHERE ${conditions.join(' AND ')}
     ORDER BY ga_fs_type, sort_num, ga_name
  `;

  const result = await client.query<MissingAccountRow>(sql, params);
  return result.rows;
}

async function insertUserAccount(
  client: PoolClient,
  row: MissingAccountRow
): Promise<number> {
  const insertSql = `
    INSERT INTO user_accounts (
      ua_name,
      ua_code,
      fs_type,
      is_credit,
      is_kpi,
      parent_ga_id,
      parent_ua_id,
      parent_ga_type
    ) VALUES ($1, $2, $3, $4, false, $5, NULL, $6)
    RETURNING id
  `;

  const result = await client.query<{ id: number }>(insertSql, [
    row.ga_name,
    row.ga_code,
    row.ga_fs_type,
    row.ga_is_credit,
    row.global_account_id,
    row.ga_type,
  ]);
  return result.rows[0]?.id ?? -1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = await pool.connect();

  try {
    const missing = await fetchMissingAccounts(client, options);
    if (missing.length === 0) {
      console.info('[sync-ua] No GLOBAL_ONLY accounts found. All good!');
      return;
    }

    console.info(
      `[sync-ua] Detected ${missing.length} global_accounts without UA coverage.`
    );
    for (const row of missing) {
      console.info(
        `  - ${row.ga_fs_type} ${row.ga_type} ${row.ga_code} (${row.ga_name})`
      );
    }

    if (options.dryRun) {
      console.info(
        '[sync-ua] Dry run enabled. No changes were applied. Re-run without --dry-run to create user_accounts.'
      );
      return;
    }

    await client.query('BEGIN');
    let inserted = 0;
    for (const row of missing) {
      try {
        const id = await insertUserAccount(client, row);
        inserted += 1;
        console.info(
          `[sync-ua] Inserted UA id=${id} name="${row.ga_name}" (GA=${row.ga_code})`
        );
      } catch (error) {
        console.error(
          `[sync-ua] Failed to insert UA for GA=${row.ga_code}:`,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }
    }
    await client.query('COMMIT');
    console.info(`[sync-ua] Completed. Inserted ${inserted} user_accounts.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(
      '[sync-ua] Sync failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    '[sync-ua] Unexpected error:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
