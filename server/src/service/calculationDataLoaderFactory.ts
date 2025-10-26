import {
  fetchUserAccounts,
  fetchGlobalAccounts,
  fetchPeriods,
  fetchImportDf,
  fetchCalculationRules,
  fetchIntegratedAccountsView,
} from './calculationRepositories.js';
import { createCalculationDataLoader } from './calculationDataLoader.js';
import {
  createDefaultTimelineOrchestrator,
  createTimelineOrchestrator,
} from './timeline/timelineOrchestrator.ts';

interface CalculationDataLoaderFactoryOptions {
  timelineOrchestrator?: ReturnType<typeof createTimelineOrchestrator>;
}

export const createDefaultCalculationDataLoader = (
  options?: CalculationDataLoaderFactoryOptions
) => {
  const timelineOrchestrator =
    options?.timelineOrchestrator ?? createDefaultTimelineOrchestrator();

  return createCalculationDataLoader({
    fetchUserAccounts,
    fetchGlobalAccounts,
    fetchPeriods,
    fetchImportDf,
    fetchCalculationRules,
    fetchIntegratedAccountsView,
    ensureScenarioTimeline: async ({
      scenarioId,
      importDf,
      projectionYears,
    }) => {
      return timelineOrchestrator.ensureScenarioTimeline({
        scenarioId,
        importDf,
        projectionYears,
      });
    },
  });
};
