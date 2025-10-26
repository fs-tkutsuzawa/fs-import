#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { MasterRule } from '../../server/src/utils/master-rules/sync-ga-codes.ts';
import { syncMasterRulesGaCodes } from '../../server/src/utils/master-rules/sync-ga-codes.ts';

type CsvRecord = Record<string, string>;

type CsvParseResult = {
  headers: string[];
  rows: CsvRecord[];
};

type SyncStats = {
  targetUpdates: number;
  referenceUpdates: number;
  ruleCount: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const GLOBAL_ACCOUNTS_CSV_PATH = path.resolve(
  ROOT_DIR,
  'docs/[docs]_master_data/global_accounts_202510201755.csv'
);
const SOURCE_TEMPLATE_PATH = path.resolve(
  ROOT_DIR,
  'server/src/templates/master_rules.json'
);
const OUTPUT_TEMPLATE_PATH = path.resolve(
  ROOT_DIR,
  'server/src/templates/master_rules.v2.json'
);

function parseCsv(content: string): CsvParseResult {
  const headers: string[] = [];
  const rows: CsvRecord[] = [];
  const headerAndRows = parseCsvLines(content);

  if (headerAndRows.length === 0) {
    return { headers, rows };
  }

  const headerRow = headerAndRows[0];
  for (const header of headerRow) {
    headers.push(header.trim());
  }

  for (let i = 1; i < headerAndRows.length; i += 1) {
    const cells = headerAndRows[i];
    if (cells.length === 1 && cells[0].trim() === '') {
      continue;
    }
    const record: CsvRecord = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? '').trim();
    });
    rows.push(record);
  }

  return { headers, rows };
}

function parseCsvLines(content: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      currentLine.push(currentValue);
      currentValue = '';
      lines.push(currentLine);
      currentLine = [];
      if (char === '\r' && content[i + 1] === '\n') {
        i += 1;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentLine.push(currentValue);
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentLine.length > 0) {
    currentLine.push(currentValue);
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function ensureMappingEntry(
  mapping: Map<string, string>,
  key: string,
  value: string
): void {
  const existing = mapping.get(key);
  if (existing && existing !== value) {
    throw new Error(
      `Conflicting mapping detected for "${key}": "${existing}" vs "${value}"`
    );
  }
  mapping.set(key, value);
}

function buildGaCodeMapping(rows: CsvRecord[]): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const row of rows) {
    const id = (row.id ?? '').trim();
    const gaCode = (row.ga_code ?? '').trim();
    if (!id || !gaCode) {
      throw new Error(
        `CSV row is missing required columns "id" or "ga_code": ${JSON.stringify(
          row
        )}`
      );
    }
    ensureMappingEntry(mapping, id, gaCode);
    ensureMappingEntry(mapping, gaCode, gaCode);
  }

  return mapping;
}

async function loadMasterRulesTemplate(
  templatePath: string
): Promise<MasterRule[]> {
  const json = await fs.readFile(templatePath, 'utf-8');
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('master_rules.json must contain an array of rules.');
  }
  return parsed;
}

function formatStats(stats: SyncStats): string {
  return [
    `rules=${stats.ruleCount}`,
    `target_updates=${stats.targetUpdates}`,
    `reference_updates=${stats.referenceUpdates}`,
  ].join(', ');
}

async function execute(): Promise<void> {
  console.log('=== Sync master_rules ga_code values ===');
  console.log(
    `Reading global accounts CSV: ${path.relative(
      process.cwd(),
      GLOBAL_ACCOUNTS_CSV_PATH
    )}`
  );
  const csvContent = await fs.readFile(GLOBAL_ACCOUNTS_CSV_PATH, 'utf-8');
  const { rows } = parseCsv(csvContent);
  if (rows.length === 0) {
    throw new Error(
      `Global accounts CSV (${GLOBAL_ACCOUNTS_CSV_PATH}) does not contain data.`
    );
  }

  const mapping = buildGaCodeMapping(rows);
  console.log(`Loaded ${mapping.size} ga_code mappings from CSV.`);

  console.log(
    `Reading master rules template: ${path.relative(
      process.cwd(),
      SOURCE_TEMPLATE_PATH
    )}`
  );
  const templateRules = await loadMasterRulesTemplate(SOURCE_TEMPLATE_PATH);
  console.log(`Loaded ${templateRules.length} rules from master_rules.json.`);

  const {
    rules: syncedRules,
    targetUpdates,
    referenceUpdates,
  } = syncMasterRulesGaCodes(templateRules, mapping);

  await fs.writeFile(
    OUTPUT_TEMPLATE_PATH,
    `${JSON.stringify(syncedRules, null, 2)}\n`,
    'utf-8'
  );

  const stats: SyncStats = {
    targetUpdates,
    referenceUpdates,
    ruleCount: syncedRules.length,
  };
  console.log(`Finished syncing master rules (${formatStats(stats)}).`);
  console.log(
    `Output written to: ${path.relative(process.cwd(), OUTPUT_TEMPLATE_PATH)}`
  );
}

async function run(): Promise<void> {
  try {
    await execute();
  } catch (error) {
    console.error('[ERROR] Failed to sync master rules GA codes.');
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  void run();
}
