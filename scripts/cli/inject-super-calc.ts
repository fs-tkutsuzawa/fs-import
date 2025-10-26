#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import dotenv from 'dotenv';

type Operator = '+' | '-' | '*' | '/';

type TemplateReference = {
  refAccountCode: string;
  operator?: Operator;
};

type TemplateRule = {
  targetAccountCode: string;
  rule_type?: string;
  description?: string;
  calculation: TemplateReference[];
};

type CliOptions = {
  scenarioIds: number[];
  dryRun: boolean;
  allScenarios: boolean;
};

type GlobalAccountRow = {
  id: string;
  ga_code: string;
  ga_name: string;
  fs_type: string;
  ga_type: string;
  is_credit: boolean | null;
};

type UserAccountRow = {
  id: number;
  ua_name: string;
  ua_code: string | null;
  fs_type: string;
  is_credit: boolean | null;
  parent_ga_id: string;
  parent_ua_id: number | null;
  ga_code: string;
  ga_name: string;
};

type ResolvedAccount = UserAccountRow;

type ProcessStats = {
  inserted: number;
  updated: number;
  skipped: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(
  __dirname,
  '../../server/src/templates/master_rules.json'
);

const ENV_PATH = path.resolve(__dirname, '../../server/.env');
dotenv.config({ path: ENV_PATH });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

const OPERATORS: Record<string, Operator> = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
};

async function loadTemplateRules(): Promise<TemplateRule[]> {
  const json = await fs.readFile(TEMPLATE_PATH, 'utf-8');
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('master_rules.json must export an array of rule objects');
  }
  for (const [index, rule] of parsed.entries()) {
    if (!rule?.targetAccountCode) {
      throw new Error(`Rule at index ${index} is missing targetAccountCode.`);
    }
    if (!Array.isArray(rule.calculation) || rule.calculation.length === 0) {
      throw new Error(
        `Rule "${rule.targetAccountCode}" must declare at least one calculation reference.`
      );
    }
    for (const ref of rule.calculation) {
      if (!ref?.refAccountCode) {
        throw new Error(
          `Rule "${rule.targetAccountCode}" contains a reference without refAccountCode.`
        );
      }
    }
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    scenarioIds: [],
    dryRun: false,
    allScenarios: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all') {
      options.allScenarios = true;
    } else if (arg.startsWith('--scenario-id=')) {
      const value = arg.split('=')[1];
      if (!value) continue;
      const ids = value.split(',').map((v) => Number.parseInt(v, 10));
      const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        throw new Error(`Invalid scenario id specified in "${arg}"`);
      }
      options.scenarioIds.push(...validIds);
    } else {
      console.warn(`Unknown argument ignored: ${arg}`);
    }
  }

  if (!options.allScenarios && options.scenarioIds.length === 0) {
    throw new Error(
      'Scenario ID is required. Use --scenario-id=<id> or --all.'
    );
  }

  return options;
}

async function fetchScenarioIds(
  client: PoolClient,
  options: CliOptions
): Promise<number[]> {
  if (options.allScenarios) {
    const result = await client.query<{ id: number }>(
      'SELECT id FROM scenarios ORDER BY id'
    );
    return result.rows.map((row) => row.id);
  }
  return Array.from(new Set(options.scenarioIds)).sort((a, b) => a - b);
}

async function fetchGlobalAccounts(
  client: PoolClient
): Promise<Map<string, GlobalAccountRow>> {
  const result = await client.query<GlobalAccountRow>(
    `SELECT id, ga_code, ga_name, fs_type, ga_type, is_credit
       FROM global_accounts`
  );

  const map = new Map<string, GlobalAccountRow>();
  for (const row of result.rows) {
    map.set(row.ga_code.toLowerCase(), row);
  }
  return map;
}

async function fetchUserAccounts(
  client: PoolClient
): Promise<Map<string, ResolvedAccount[]>> {
  const result = await client.query<UserAccountRow>(
    `SELECT ua.id,
            ua.ua_name,
            ua.ua_code,
            ua.fs_type,
            ua.is_credit,
            ua.parent_ga_id,
            ua.parent_ua_id,
            ga.ga_code,
            ga.ga_name
       FROM user_accounts ua
       JOIN global_accounts ga
         ON ua.parent_ga_id = ga.id
       ORDER BY ua.id`
  );

  const map = new Map<string, ResolvedAccount[]>();
  for (const row of result.rows) {
    const key = row.ga_code.toLowerCase();
    const list = map.get(key);
    if (list) {
      list.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function selectAccount(
  gaCode: string,
  candidates: ResolvedAccount[] | undefined
): ResolvedAccount | null {
  if (!candidates || candidates.length === 0) return null;
  const lower = gaCode.toLowerCase();

  const exactUaCode = candidates.find(
    (acc) => acc.ua_code !== null && acc.ua_code.toLowerCase() === lower
  );
  if (exactUaCode) return exactUaCode;

  const topLevel = candidates.find((acc) => acc.parent_ua_id === null);
  if (topLevel) return topLevel;

  return candidates[0] ?? null;
}

function mapOperator(raw?: string): Operator {
  if (!raw) return '+';
  const normalized = raw.trim();
  const op = OPERATORS[normalized];
  return op ?? '+';
}

function buildExpression(
  refs: { account: ResolvedAccount; operator: Operator }[]
): string {
  return refs
    .map((ref, index) => {
      if (index === 0) {
        return `@${ref.account.id}`;
      }
      const op = ref.operator ?? '+';
      return `${op} @${ref.account.id}`;
    })
    .join(' ');
}

async function processScenario(
  client: PoolClient,
  scenarioId: number,
  rules: TemplateRule[],
  userAccountMap: Map<string, ResolvedAccount[]>,
  globalMap: Map<string, GlobalAccountRow>,
  dryRun: boolean
): Promise<ProcessStats> {
  const stats: ProcessStats = { inserted: 0, updated: 0, skipped: 0 };

  for (const rule of rules) {
    const targetCode = rule.targetAccountCode.toLowerCase();
    if (!globalMap.has(targetCode)) {
      console.warn(
        `[SKIP] Scenario ${scenarioId}: global account not found for ga_code="${rule.targetAccountCode}"`
      );
      stats.skipped += 1;
      continue;
    }
    const targetCandidates = userAccountMap.get(targetCode);
    const targetAccount = selectAccount(targetCode, targetCandidates);

    if (!targetAccount) {
      console.warn(
        `[SKIP] Scenario ${scenarioId}: target account not found for ga_code="${rule.targetAccountCode}"`
      );
      stats.skipped += 1;
      continue;
    }

    const resolvedRefs: { account: ResolvedAccount; operator: Operator }[] = [];
    let missingReference = false;

    for (const item of rule.calculation) {
      const refCode = item.refAccountCode.toLowerCase();
      if (!globalMap.has(refCode)) {
        console.warn(
          `[SKIP] Scenario ${scenarioId}: reference global account not found for ga_code="${item.refAccountCode}" (target=${rule.targetAccountCode})`
        );
        missingReference = true;
        break;
      }
      const refCandidates = userAccountMap.get(refCode);
      const refAccount = selectAccount(refCode, refCandidates);
      if (!refAccount) {
        console.warn(
          `[SKIP] Scenario ${scenarioId}: reference account not found for ga_code="${item.refAccountCode}" (target=${rule.targetAccountCode})`
        );
        missingReference = true;
        break;
      }
      resolvedRefs.push({
        account: refAccount,
        operator: mapOperator(item.operator),
      });
    }

    if (missingReference || resolvedRefs.length === 0) {
      stats.skipped += 1;
      continue;
    }

    const expression = buildExpression(resolvedRefs);
    const references = resolvedRefs.map(({ account, operator }) => {
      const base: Record<string, unknown> = {
        userAccountId: account.id,
        accountName: account.ua_name,
        operator,
      };
      if (account.parent_ga_id) {
        base.globalAccountId = account.parent_ga_id;
      }
      if (account.ua_code) {
        base.userAccountCode = account.ua_code;
      }
      return base;
    });

    const ruleDefinition = {
      type: 'custom_calc',
      formula: {
        expression,
        references,
      },
      ...(rule.description ? { description: rule.description } : {}),
      template: 'master_rules_v1',
    };

    if (dryRun) {
      console.log(
        `[DRY-RUN] Scenario ${scenarioId}: would apply rule ${rule.targetAccountCode} -> expression "${expression}"`
      );
      stats.updated += 1;
      continue;
    }

    const ruleType = rule.rule_type ?? 'PARAMETER';
    const updateResult = await client.query(
      `UPDATE calculation_rules
         SET rule_type = $1,
             rule_definition = $2::jsonb,
             updated_at = NOW()
       WHERE scenario_id = $3
         AND target_user_account_id = $4
         AND period_id IS NULL`,
      [ruleType, JSON.stringify(ruleDefinition), scenarioId, targetAccount.id]
    );

    if (updateResult.rowCount && updateResult.rowCount > 0) {
      stats.updated += 1;
      continue;
    }

    await client.query(
      `INSERT INTO calculation_rules
        (target_user_account_id, scenario_id, period_id, rule_type, rule_definition, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4::jsonb, NOW(), NOW())`,
      [targetAccount.id, scenarioId, ruleType, JSON.stringify(ruleDefinition)]
    );
    stats.inserted += 1;
  }

  return stats;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const templateRules = await loadTemplateRules();

  const client = await pool.connect();
  try {
    const scenarioIds = await fetchScenarioIds(client, options);
    if (scenarioIds.length === 0) {
      console.log('No scenarios found. Nothing to do.');
      return;
    }

    const globalAccounts = await fetchGlobalAccounts(client);
    if (globalAccounts.size === 0) {
      throw new Error('global_accounts table is empty.');
    }

    const userAccountsMap = await fetchUserAccounts(client);

    await client.query('BEGIN');

    const totals: ProcessStats = { inserted: 0, updated: 0, skipped: 0 };

    for (const scenarioId of scenarioIds) {
      console.log(`\n=== Processing scenario ${scenarioId} ===`);
      const stats = await processScenario(
        client,
        scenarioId,
        templateRules,
        userAccountsMap,
        globalAccounts,
        options.dryRun
      );
      console.log(
        `Scenario ${scenarioId}: inserted=${stats.inserted}, updated=${stats.updated}, skipped=${stats.skipped}`
      );
      totals.inserted += stats.inserted;
      totals.updated += stats.updated;
      totals.skipped += stats.skipped;
    }

    if (options.dryRun) {
      await client.query('ROLLBACK');
      console.log(
        '\nDry run complete. No changes were applied to the database.'
      );
    } else {
      await client.query('COMMIT');
      console.log(
        `\nDone. Inserted=${totals.inserted}, Updated=${totals.updated}, Skipped=${totals.skipped}`
      );
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nInjection failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
