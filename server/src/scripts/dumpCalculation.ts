#!/usr/bin/env node
import process from 'node:process';
import { createDefaultCalculationDataLoader } from '../service/calculationDataLoaderFactory.ts';
import { createCalculationExecutor } from '../service/calculationExecutor.ts';
import { createInMemoryJobStore } from '../service/calculationJobStore.ts';
import { fetchIntegratedAccountsView } from '../service/calculationRepositories.ts';
import { FAM } from '../fam/fam';
import type { CalculationJobResult } from '../model/calculation';

const getArgValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const printUsageAndExit = (message?: string, code = 1) => {
  if (message) console.error(message);
  console.info(
    'Usage: npm --prefix server run calculation:dump -- --model <MODEL_ID> --scenario <SCENARIO_ID> [--projection <YEARS>] [--base-profit <ACCOUNT_ID>]'
  );
  process.exit(code);
};

class DebugFAM extends FAM {
  private dumpTable(table: ReturnType<FAM['getTable']>) {
    console.info('=== FAM TABLE (rows x columns) ===');
    console.info(`Columns: ${table.columns.join(', ')}`);
    table.rows.forEach((row, index) => {
      const values = table.data[index] ?? [];
      const line = values
        .map((value, colIdx) => `${table.columns[colIdx]}=${value}`)
        .join(', ');
      const label =
        row.ga?.ga_name ?? row.name ?? row.accountId ?? `row-${index}`;
      console.info(`- ${label}: ${line}`);
    });
    console.info('===============================');
  }

  override compute(options: Parameters<FAM['compute']>[0]): void {
    // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 対応コード
    console.info('[calculation:dump] Running FAM.compute', options);
    super.compute(options);
  }

  override getTable(params: Parameters<FAM['getTable']>[0]) {
    const table = super.getTable(params);
    this.dumpTable(table);
    console.info('=== FAM AST (Graphviz DOT) ===');
    this.vizAST();
    console.info('================================');
    return table;
  }
}

const modelArg = getArgValue('--model');
const scenarioArg = getArgValue('--scenario');
const projectionArg = getArgValue('--projection');
const baseProfitArg = getArgValue('--base-profit');

const modelId = Number(modelArg);
const scenarioId = Number(scenarioArg);
const projectionYears = projectionArg ? Number(projectionArg) : 3;

if (!Number.isFinite(modelId) || modelId <= 0) {
  printUsageAndExit('modelId must be a positive number');
}

if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
  printUsageAndExit('scenarioId must be a positive number');
}

if (!Number.isFinite(projectionYears) || projectionYears < 0) {
  printUsageAndExit('projection must be a non-negative number');
}

const loader = createDefaultCalculationDataLoader();
const jobStore = createInMemoryJobStore();

const executor = createCalculationExecutor({
  jobStore,
  loadCalculationInputs: loader,
  createFam: () => new DebugFAM(),
});

const request = {
  modelId,
  scenarioId,
  projectionYears,
  baseProfitAccountId: baseProfitArg,
};

try {
  const integratedRows = await fetchIntegratedAccountsView();
  const globalOnly = integratedRows.filter(
    (row) => row.source === 'GLOBAL_ONLY'
  );
  if (globalOnly.length > 0) {
    const codes = globalOnly
      .slice(0, 10)
      .map((row) => row.ga_code)
      .join(', ');
    throw new Error(
      `ユーザー勘定が未登録の global_accounts があります: ${codes}. ` +
        '「npm run sync:ua」で user_accounts を同期してください。'
    );
  }

  const jobId = jobStore.enqueue(request);
  await executor(jobId, request);
  const snapshot = jobStore.get(jobId);
  if (!snapshot) {
    throw new Error('計算ジョブの結果を取得できませんでした');
  }

  if (snapshot.status !== 'COMPLETED') {
    const reason = snapshot.error
      ? `失敗理由: ${snapshot.error}`
      : '失敗理由: 不明';
    throw new Error(`計算ジョブが失敗しました。${reason}`);
  }

  const result: CalculationJobResult | null = (snapshot.result ??
    null) as CalculationJobResult | null;
  if (!result) {
    throw new Error('計算結果が取得できませんでした (resultが空です)');
  }

  console.info('=== Calculation Payload ===');
  console.info(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (error) {
  console.error(
    '[calculation:dump] Failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
