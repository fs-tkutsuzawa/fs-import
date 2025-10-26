#!/usr/bin/env node

import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

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

type CliArgs = {
  scenarioId: number | null;
  limit: number;
};

function parseArgs(): CliArgs {
  let scenarioId: number | null = null;
  let limit = 50;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--scenario-id=')) {
      const value = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (!Number.isNaN(value) && value > 0) {
        scenarioId = value;
      }
    } else if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.split('=')[1] ?? '', 10);
      if (!Number.isNaN(value) && value > 0) {
        limit = value;
      }
    } else {
      console.warn(`Unknown argument ignored: ${arg}`);
    }
  }

  if (!scenarioId) {
    throw new Error('scenario id is required (--scenario-id=123)');
  }

  return { scenarioId, limit };
}

async function main() {
  const args = parseArgs();
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      SELECT cr.id,
             cr.scenario_id,
             ua.id AS user_account_id,
             ua.ua_name,
             ua.ua_code,
             ua.fs_type,
             ga.ga_code,
             cr.rule_type,
             cr.rule_definition
        FROM calculation_rules cr
        JOIN user_accounts ua
          ON cr.target_user_account_id = ua.id
        JOIN global_accounts ga
          ON ua.parent_ga_id = ga.id
       WHERE cr.scenario_id = $1
       ORDER BY ua.fs_type, ga.ga_code
       LIMIT $2
      `,
      [args.scenarioId, args.limit]
    );

    if (rows.length === 0) {
      console.log(
        `No calculation_rules found for scenario_id=${args.scenarioId}`
      );
      return;
    }

    console.log(
      `Found ${rows.length} calculation_rules for scenario_id=${args.scenarioId}`
    );
    for (const row of rows) {
      console.log('='.repeat(80));
      console.log(
        `Rule #${row.id} | UA ${row.user_account_id} (${row.ua_name}) [${row.ua_code ?? 'no-code'}]`
      );
      console.log(
        `  fs_type=${row.fs_type} ga_code=${row.ga_ga_code ?? row.ga_code} rule_type=${row.rule_type}`
      );
      console.log(
        `  rule_definition=${JSON.stringify(row.rule_definition, null, 2)}`
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
