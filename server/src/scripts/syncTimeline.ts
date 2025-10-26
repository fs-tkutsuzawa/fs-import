#!/usr/bin/env node
import process from 'node:process';
import { createDefaultTimelineOrchestrator } from '../service/timeline/timelineOrchestrator.ts';
import { fetchImportDf } from '../service/calculationRepositories.ts';
import { logger } from '../logger.ts';

const getArgValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const printUsageAndExit = (message?: string, code = 1) => {
  if (message) {
    console.error(message);
  }
  console.info(
    'Usage: npm --prefix server run timeline:sync -- --model <MODEL_ID> --scenario <SCENARIO_ID>'
  );
  process.exit(code);
};

const modelArg = getArgValue('--model');
const scenarioArg = getArgValue('--scenario');

const modelId = Number(modelArg);
const scenarioId = Number(scenarioArg);

if (!Number.isFinite(modelId) || modelId <= 0) {
  printUsageAndExit('modelId must be a positive number');
}

if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
  printUsageAndExit('scenarioId must be a positive number');
}

try {
  const importDf = await fetchImportDf(modelId);
  const orchestrator = createDefaultTimelineOrchestrator();
  const periods = await orchestrator.ensureScenarioTimeline({
    scenarioId,
    importDf: importDf.df_json,
  });

  console.info(
    JSON.stringify(
      {
        modelId,
        scenarioId,
        periods,
      },
      null,
      2
    )
  );
  process.exit(0);
} catch (error) {
  logger.error('timeline:sync failed', error);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
