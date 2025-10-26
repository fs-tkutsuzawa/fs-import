import { createCalculationExecutor } from '../service/calculationExecutor';
import { createInMemoryJobStore } from '../service/calculationJobStore';
import { createCalculationDataLoader } from '../service/calculationDataLoader';
import type {
  RawUserAccount,
  RawGlobalAccount,
  RawPeriod,
  RawCalculationRule,
} from '../service/calculationDataTransforms';
import {
  userAccountsFixture,
  globalAccountsFixture,
  periodsFixture,
  importDfFixture,
  calculationRulesFixture,
  integratedAccountsViewFixture,
} from './fixtures/calculationFixtures';

const buildLoader = () =>
  createCalculationDataLoader({
    fetchUserAccounts: async () => userAccountsFixture as RawUserAccount[],
    fetchGlobalAccounts: async () =>
      globalAccountsFixture as RawGlobalAccount[],
    fetchPeriods: async () => periodsFixture as RawPeriod[],
    fetchImportDf: async () => importDfFixture,
    fetchCalculationRules: async () =>
      calculationRulesFixture as RawCalculationRule[],
    fetchIntegratedAccountsView: async () => integratedAccountsViewFixture,
  });

describe('calculation CLI integration (sync→inject→dump equivalent)', () => {
  test('calculation executor completes with default fixtures', async () => {
    const loader = buildLoader();
    const jobStore = createInMemoryJobStore();
    const executor = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
    });

    await executor(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
    });

    const snapshot = jobStore.get(jobId);

    expect(snapshot?.status).toBe('COMPLETED');
    expect(snapshot?.result?.financialData?.length ?? 0).toBeGreaterThan(0);
  });
});
