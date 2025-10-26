#!/usr/bin/env node
import process from 'node:process';
import pool from '../../api/db.ts';
import { INTEGRATED_ACCOUNTS_VIEW_SQL } from '../util/sql/integratedAccountsView.ts';

const usage = `Usage:
  npm --prefix server run view:integrated:create

Environment:
  Requires database connection variables (POSTGRES_*) to be configured.`;

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.info(usage);
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    console.info('[view:integrated] Creating integrated_accounts_view …');
    await client.query('BEGIN');
    await client.query(INTEGRATED_ACCOUNTS_VIEW_SQL);
    await client.query('COMMIT');
    console.info('[view:integrated] View created successfully.');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error(
        '[view:integrated] Failed to rollback transaction:',
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError)
      );
    });
    console.error(
      '[view:integrated] Failed to create view:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    '[view:integrated] Unexpected failure:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
