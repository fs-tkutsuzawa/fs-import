import { jest } from '@jest/globals';
import { createCalculationDataLoader } from '../service/calculationDataLoader';
import type {
  RawCalculationRule,
  RawGlobalAccount,
  RawPeriod,
  RawUserAccount,
} from '../service/calculationDataTransforms';
import type { ExistingPeriodRecord } from '../service/timeline/timelineReconciler';
import {
  userAccountsFixture,
  globalAccountsFixture,
  periodsFixture,
  importDfFixture,
  calculationRulesFixture,
  integratedAccountsViewFixture,
} from './fixtures/calculationFixtures';

describe('計算データローダ', () => {
  test('タイムライン同期結果を利用して計算データを返す', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => importDfFixture);
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );
    const ensureScenarioTimeline = jest.fn(async () =>
      periodsFixture.map(
        (period) => ({ ...period }) as unknown as ExistingPeriodRecord
      )
    );

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
      ensureScenarioTimeline,
    });

    const result = await loadCalculationInputs({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 3,
    });

    expect(fetchUserAccounts).toHaveBeenCalledWith(1);
    expect(fetchGlobalAccounts).toHaveBeenCalled();
    expect(fetchImportDf).toHaveBeenCalledWith(1);
    expect(fetchCalculationRules).toHaveBeenCalledWith(11);
    expect(fetchIntegratedAccountsView).toHaveBeenCalled();
    expect(ensureScenarioTimeline).toHaveBeenCalledWith({
      modelId: 1,
      scenarioId: 11,
      importDf: importDfFixture.df_json,
      projectionYears: 3,
    });
    expect(fetchPeriods).not.toHaveBeenCalled();

    expect(result.accountsMaster).toHaveLength(userAccountsFixture.length);
    expect(result.periods[0].period_label).toBe('FY2023');
    expect(result.prevs[0]['101']).toBe(800);
    expect(result.parameterRules.length).toBe(1);
    expect(result.balanceChanges.length).toBe(1);
  });

  test('タイムライン同期が失敗した場合は既存期間をフォールバックで利用する', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => importDfFixture);
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );
    const ensureScenarioTimeline = jest.fn(async () => {
      throw new Error('同期失敗');
    });

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
      ensureScenarioTimeline,
    });

    const result = await loadCalculationInputs({ modelId: 1, scenarioId: 11 });

    expect(fetchPeriods).toHaveBeenCalledWith(11);
    expect(result.periods).toHaveLength(periodsFixture.length);
  });

  test('期間情報が最終的に取得できない場合はエラーにする', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => [] as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => importDfFixture);
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );
    const ensureScenarioTimeline = jest.fn(async () => []);

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
      ensureScenarioTimeline,
    });

    await expect(
      loadCalculationInputs({ modelId: 1, scenarioId: 999 })
    ).rejects.toThrow('シナリオID 999 に対応する期間情報が存在しません');
  });

  test('ラベルベースのPREVSをユーザー勘定IDに正規化する', async () => {
    const legacyImportDf = {
      model_id: 1,
      df_json: {
        rows: [
          {
            type: 'Account',
            label: '売上高',
            values: [800, 880],
          },
          {
            type: 'Account',
            label: '営業利益',
            values: [120, 135],
          },
        ],
        periods: ['2023-12', '2024-12', 'EOL'],
      },
    } as any;

    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => legacyImportDf);
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );
    const ensureScenarioTimeline = jest.fn(async () =>
      periodsFixture.map(
        (period) => ({ ...period }) as unknown as ExistingPeriodRecord
      )
    );

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
      ensureScenarioTimeline,
    });

    const result = await loadCalculationInputs({ modelId: 1, scenarioId: 11 });

    expect(result.prevs[0]).toMatchObject({
      '101': 800,
      '102': 120,
    });
    expect(result.prevs[1]).toMatchObject({
      '101': 880,
      '102': 135,
    });
  });

  test('integrated_accounts_view に GLOBAL_ONLY が存在する場合は例外を投げる', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => importDfFixture);
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(async () => [
      ...integratedAccountsViewFixture,
      {
        ...integratedAccountsViewFixture[0],
        source: 'GLOBAL_ONLY' as const,
        user_account_id: null,
        ua_name: null,
        ua_code: null,
        ga_code: 'GA-PL-ORDINARY-INCOME',
        ga_name: '経常利益',
      },
    ]);

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
    });

    await expect(
      loadCalculationInputs({ modelId: 1, scenarioId: 11 })
    ).rejects.toThrow('ユーザー勘定が未登録のグローバル勘定があります');
  });

  test('PREVS に GA コード/名称が含まれていても UA ID に正規化される', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => ({
      df_json: [
        {
          売上高: 100,
          'GA-PL-NET-SALES': 200,
        },
      ],
    }));
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
    });

    const result = await loadCalculationInputs({ modelId: 1, scenarioId: 11 });
    expect(result.prevs[0]).toMatchObject({
      '101': 200, // latest value overwritten by GA code entry
    });
  });

  test('PREVS に未知のキーが含まれている場合は例外を投げる', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => ({
      df_json: [
        {
          未知の勘定: 999,
        },
      ],
    }));
    const fetchCalculationRules = jest.fn(
      async (_scenarioId: number) =>
        calculationRulesFixture as RawCalculationRule[]
    );
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
    });

    await expect(
      loadCalculationInputs({ modelId: 1, scenarioId: 11 })
    ).rejects.toThrow('PREVS に未解決の勘定キーがあります');
  });

  test('PREVS に欠けた Super Calc を parameter rule で補完する', async () => {
    const fetchUserAccounts = jest.fn(
      async (_modelId: number) => userAccountsFixture as RawUserAccount[]
    );
    const fetchGlobalAccounts = jest.fn(
      async () => globalAccountsFixture as RawGlobalAccount[]
    );
    const fetchPeriods = jest.fn(
      async (_scenarioId: number) => periodsFixture as RawPeriod[]
    );
    const fetchImportDf = jest.fn(async (_modelId: number) => ({
      df_json: [
        {
          '101': 500,
        },
      ],
    }));
    const customRules: RawCalculationRule[] = [
      {
        id: 999,
        target_user_account_id: 102,
        scenario_id: 11,
        period_id: null,
        rule_type: 'PARAMETER',
        rule_definition: {
          type: 'custom_calc',
          formula: {
            references: [
              {
                userAccountId: 101,
                operator: '+',
              },
            ],
          },
        },
      },
    ];
    const fetchCalculationRules = jest.fn(async () => customRules);
    const fetchIntegratedAccountsView = jest.fn(
      async () => integratedAccountsViewFixture
    );

    const loadCalculationInputs = createCalculationDataLoader({
      fetchUserAccounts,
      fetchGlobalAccounts,
      fetchPeriods,
      fetchImportDf,
      fetchCalculationRules,
      fetchIntegratedAccountsView,
    });

    const result = await loadCalculationInputs({ modelId: 1, scenarioId: 11 });
    expect(result.prevs[0]).toMatchObject({
      '101': 500,
      '102': 500,
    });
  });
});
