import { jest } from '@jest/globals';
import { createInMemoryJobStore } from '../service/calculationJobStore';
import { createCalculationExecutor } from '../service/calculationExecutor';
import type { CalculationDataResult } from '../service/calculationDataLoader';
import { GAID } from '@/model/globalAccount.ja.js';

const buildInputs = (): CalculationDataResult => ({
  accountsMaster: [
    {
      id: '101',
      ua_id: 101,
      ua_name: '売上高',
      ua_code: 'UA_NET_SALES',
      fs_type: 'PL',
      is_credit: false,
      is_kpi: true,
      parent_ga_id: 'GA_NET_SALES',
      parent_ga_type: 'aggregate',
      parent_ua_id: null,
      ga: {
        id: 'GA_NET_SALES',
        ga_name: '売上高',
        ga_code: 'GA-PL-NET-SALES',
        fs_type: 'PL',
        ga_type: 'aggregate',
        is_credit: false,
        parent_ga_id: 'GA_PL_ROOT',
        sort_num: 10,
        indent_num: 1,
      },
    },
    {
      id: '201',
      ua_id: 201,
      ua_name: '現金及び預金',
      ua_code: 'UA_CASH',
      fs_type: 'BS',
      is_credit: false,
      is_kpi: false,
      parent_ga_id: GAID.CASH,
      parent_ga_type: 'aggregate',
      parent_ua_id: null,
      ga: {
        id: GAID.CASH,
        ga_name: '現金及び預金',
        ga_code: 'GA-BS-CASH',
        fs_type: 'BS',
        ga_type: 'aggregate',
        is_credit: false,
        parent_ga_id: 'GA_BS_ASSETS',
        sort_num: 1,
        indent_num: 0,
      },
    },
  ],
  periods: [
    {
      id: 1,
      scenario_id: 11,
      period_label: 'FY2023',
      display_order: 1,
      period_val: '2023-12-31',
      period_type: 'Yearly' as const,
      af_type: 'Actual' as const,
    },
    {
      id: 2,
      scenario_id: 11,
      period_label: 'FY2024',
      display_order: 2,
      period_val: '2024-12-31',
      period_type: 'Yearly' as const,
      af_type: 'Forecast' as const,
    },
    {
      id: 3,
      scenario_id: 11,
      period_label: 'FY2025',
      display_order: 3,
      period_val: '2025-12-31',
      period_type: 'Yearly' as const,
      af_type: 'Forecast' as const,
    },
    {
      id: 4,
      scenario_id: 11,
      period_label: 'FY2026',
      display_order: 4,
      period_val: '2026-12-31',
      period_type: 'Yearly' as const,
      af_type: 'Forecast' as const,
    },
  ],
  prevs: [
    {
      '101': 800,
      '201': 500,
    },
    {
      '101': 880,
      '201': 520,
    },
  ],
  parameterRules: [],
  balanceChanges: [],
});

const buildInputsWithForecast = (): CalculationDataResult => {
  const base = buildInputs();
  return {
    ...base,
    periods: [
      ...base.periods,
      {
        id: 5,
        scenario_id: 11,
        period_label: 'FY2027',
        display_order: 5,
        period_val: '2027-12-31',
        period_type: 'Yearly' as const,
        af_type: 'Forecast' as const,
      },
    ],
  };
};

describe('計算オーケストレーター', () => {
  test('ジョブの状態遷移と結果保存を行う', async () => {
    const jobStore = createInMemoryJobStore();
    const loader = jest.fn(async () => buildInputs());

    const execute = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    await execute(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 1,
        scenarioId: 11,
        projectionYears: 2,
      })
    );
    const snapshot = jobStore.get(jobId);
    expect(snapshot?.status).toBe('COMPLETED');
    expect(snapshot?.result).toBeTruthy();
    const financialData = snapshot?.result?.financialData as Array<any>;
    expect(financialData?.length ?? 0).toBeGreaterThanOrEqual(2);
    const values = financialData
      .filter(
        (item) =>
          item.period_label === 'FY2023' || item.period_label === 'FY2024'
      )
      .map((item) => item.value);
    expect(values).toEqual(expect.arrayContaining([800, 880]));
  });

  test('PL と同時に BS の値も financialData に含める', async () => {
    const jobStore = createInMemoryJobStore();
    const loader = jest.fn(async () => buildInputs());

    const execute = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    await execute(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    const snapshot = jobStore.get(jobId);
    expect(snapshot?.status).toBe('COMPLETED');
    const financialData = snapshot?.result?.financialData as Array<any>;
    expect(financialData?.length ?? 0).toBeGreaterThan(0);

    const bsRows = financialData.filter(
      (row) =>
        row.fs_type === 'BS' &&
        row.ua_code === 'UA_CASH' &&
        row.period_label === 'FY2023'
    );
    expect(bsRows.length).toBeGreaterThan(0);
    expect(bsRows[0].value).toBe(500);
  });

  test('計算中に例外が発生した場合はFAILEDで終了する', async () => {
    const jobStore = createInMemoryJobStore();
    const loader = jest.fn(async () => {
      throw new Error('DB error');
    });

    const execute = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    await execute(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    const snapshot = jobStore.get(jobId);
    expect(snapshot?.status).toBe('FAILED');
    expect(snapshot?.error).toBe('DB error');
  });

  test('Projection年の列を要求しForecastデータを返却する', async () => {
    // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 / 4.テスト拡充
    const jobStore = createInMemoryJobStore();
    const loader = jest.fn(async () => buildInputsWithForecast());

    const getTableMock = jest.fn(() => ({
      rows: [
        {
          accountId: '101',
          ua_code: 'UA_NET_SALES',
          fs_type: 'PL',
          is_credit: false,
          is_kpi: true,
          parent_ga_id: 'GA_NET_SALES',
          parent_ga_type: 'aggregate',
          parent_ua_id: null,
          ga: {
            id: 'GA_NET_SALES',
            ga_name: '売上高',
            ga_code: 'GA-PL-NET-SALES',
            fs_type: 'PL',
            ga_type: 'aggregate',
            is_credit: false,
            parent_ga_id: 'GA_PL_ROOT',
            sort_num: 10,
            indent_num: 1,
          },
        },
      ],
      columns: ['FY:2023', 'FY:2024', 'FY:2025'],
      data: [[800, 880, 920]],
    }));

    const computeMock = jest.fn();
    const executor = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
      createFam: () =>
        ({
          importActuals: jest.fn(),
          setRules: jest.fn(),
          setBalanceChange: jest.fn(),
          compute: computeMock,
          getTable: getTableMock,
        }) as any,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
      baseProfitAccountId: '101',
    });

    await executor(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
      baseProfitAccountId: '101',
    });

    expect(getTableMock).toHaveBeenCalledWith({
      fs: 'PL',
      years: [2023, 2024, 2025],
    });
    expect(computeMock).toHaveBeenCalledWith({
      years: 1,
      baseProfitAccount: '101',
      cashAccount: GAID.CASH,
    });

    const snapshot = jobStore.get(jobId);
    expect(snapshot?.status).toBe('COMPLETED');
    const plRows = (snapshot?.result?.financialData as Array<any>).filter(
      (row) => row.fs_type === 'PL' && row.ua_code === 'UA_NET_SALES'
    );
    expect(plRows).toHaveLength(3);
    expect(plRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period_label: 'FY2025',
          af_type: 'Forecast',
        }),
      ])
    );
  });

  test('Projection年がForecast期間無しでも付与される', async () => {
    const jobStore = createInMemoryJobStore();
    const loader = jest.fn(async () => {
      const base = buildInputs();
      return {
        ...base,
        periods: [
          {
            id: 1,
            scenario_id: 11,
            period_label: 'FY2022',
            display_order: 1,
            period_val: '2022-12-31',
            period_type: 'Yearly' as const,
            af_type: 'Actual' as const,
          },
          {
            id: 2,
            scenario_id: 11,
            period_label: 'FY2023',
            display_order: 2,
            period_val: '2023-12-31',
            period_type: 'Yearly' as const,
            af_type: 'Actual' as const,
          },
        ],
        prevs: [
          {
            '101': 800,
          },
          {
            '101': 880,
          },
        ],
      };
    });

    const getTableMock = jest.fn(() => ({
      rows: [],
      columns: [],
      data: [],
    }));

    const executor = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
      createFam: () =>
        ({
          importActuals: jest.fn(),
          setRules: jest.fn(),
          setBalanceChange: jest.fn(),
          compute: jest.fn(),
          getTable: getTableMock,
        }) as any,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    await executor(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 2,
    });

    expect(getTableMock).toHaveBeenCalledWith({
      fs: 'PL',
      years: [2022, 2023, 2024, 2025],
    });
  });

  test('GAID 正規化により cash 勘定が小文字でも projection を実行する', async () => {
    const jobStore = createInMemoryJobStore();
    const base = buildInputs();
    const loader = jest.fn(async () => ({
      ...base,
      accountsMaster: [
        {
          ...base.accountsMaster[0],
          ga: {
            ...base.accountsMaster[0].ga,
            id: 'ordinary_income',
            ga_code: 'ordinary_income',
            parent_ga_id: 'ordinary_income',
            fs_type: 'PL',
          },
          parent_ga_id: 'ordinary_income',
        },
        {
          ...base.accountsMaster[1],
          ga: {
            ...base.accountsMaster[1].ga,
            id: 'cash',
            ga_code: 'cash',
            parent_ga_id: 'cash',
            fs_type: 'BS',
          },
          parent_ga_id: 'cash',
        },
      ],
    }));

    const computeMock = jest.fn();
    const getTableMock = jest.fn(() => ({
      rows: [
        {
          accountId: '101',
          ua_code: 'UA_NET_SALES',
          fs_type: 'PL',
          is_credit: false,
          is_kpi: true,
          parent_ga_id: 'ordinary_income',
          parent_ga_type: 'aggregate',
          parent_ua_id: null,
          ga: {
            id: 'ordinary_income',
            ga_name: '営業利益',
            ga_code: 'ordinary_income',
            fs_type: 'PL',
            ga_type: 'aggregate',
            is_credit: false,
            parent_ga_id: 'ordinary_income',
            sort_num: 10,
            indent_num: 1,
          },
        },
      ],
      columns: ['FY:2023', 'FY:2024'],
      data: [[800, 880]],
    }));

    const executor = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
      createFam: () =>
        ({
          importActuals: jest.fn(),
          setRules: jest.fn(),
          setBalanceChange: jest.fn(),
          compute: computeMock,
          getTable: getTableMock,
        }) as any,
    });

    const jobId = jobStore.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
      baseProfitAccountId: '101',
    });

    await executor(jobId, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
      baseProfitAccountId: '101',
    });

    expect(computeMock).toHaveBeenCalled();
    const snapshot = jobStore.get(jobId);
    expect(snapshot?.status).toBe('COMPLETED');
  });

  test('lower-case rule definitions are normalized for FAM', async () => {
    const jobStore = createInMemoryJobStore();
    const base = buildInputs();

    const extendedAccounts = [
      ...base.accountsMaster,
      {
        id: '202',
        ua_id: 202,
        ua_name: '販管費',
        ua_code: 'UA_SGA',
        fs_type: 'PL',
        is_credit: false,
        is_kpi: false,
        parent_ga_id: 'GA_SGA',
        parent_ga_type: 'aggregate',
        parent_ua_id: null,
        ga: {
          id: 'GA_SGA',
          ga_name: '販管費',
          ga_code: 'GA-PL-SGA',
          fs_type: 'PL',
          ga_type: 'aggregate',
          is_credit: false,
          parent_ga_id: 'GA_PL_ROOT',
          sort_num: 20,
          indent_num: 1,
        },
      },
      {
        id: '401',
        ua_id: 401,
        ua_name: '流動資産',
        ua_code: 'UA_CURRENT_ASSETS',
        fs_type: 'BS',
        is_credit: false,
        is_kpi: false,
        parent_ga_id: 'current_assets',
        parent_ga_type: 'super_calc',
        parent_ua_id: null,
        ga: {
          id: 'current_assets',
          ga_name: '流動資産',
          ga_code: 'current_assets',
          fs_type: 'BS',
          ga_type: 'super_calc',
          is_credit: false,
          parent_ga_id: 'assets',
          sort_num: 4,
          indent_num: 1,
        },
      },
    ];

    const loader = jest.fn(async () => ({
      ...base,
      accountsMaster: extendedAccounts,
      parameterRules: [
        {
          id: 1,
          target_user_account_id: 101,
          scenario_id: 11,
          period_id: null,
          rule_type: 'PARAMETER',
          rule_definition: {
            type: 'custom_calc',
            formula: {
              expression: '@201 - @202',
              references: [
                { userAccountId: 201, accountName: '現金' },
                { userAccountId: 202, accountName: '販管費' },
              ],
            },
          },
        },
        {
          id: 2,
          target_user_account_id: 401,
          scenario_id: 11,
          period_id: null,
          rule_type: 'PARAMETER',
          rule_definition: {
            type: 'sum_children',
          },
        },
      ],
    }));

    const setRulesMock = jest.fn();
    const famMock = {
      importActuals: jest.fn(),
      setRules: setRulesMock,
      setBalanceChange: jest.fn(),
      compute: jest.fn(),
      getTable: jest.fn(() => ({ rows: [], columns: [], data: [] })),
    } as any;

    const executor = createCalculationExecutor({
      jobStore,
      loadCalculationInputs: loader,
      createFam: () => famMock,
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

    expect(setRulesMock).toHaveBeenCalled();
    const ruleMap = setRulesMock.mock.calls[0][0];
    expect(ruleMap['101']?.type).toBe('CALCULATION');
    expect(ruleMap['101']?.refs?.length).toBe(2);
    expect(ruleMap['101']?.refs?.[1]?.sign).toBe(-1);
    expect(ruleMap['401']?.type).toBe('CHILDREN_SUM');
    expect(ruleMap['201']?.type).toBe('INPUT');

    const loaderWithCalcRule = jest.fn(async () => ({
      ...base,
      accountsMaster: extendedAccounts,
      parameterRules: [
        {
          id: 1,
          target_user_account_id: 101,
          scenario_id: 11,
          period_id: null,
          rule_type: 'PARAMETER',
          rule_definition: {
            type: 'calculation',
            refs: [
              {
                account: { id: '201' },
                period: {
                  Period_type: 'Yearly',
                  AF_type: 'Actual',
                  Period_val: 2023,
                },
                sign: 1,
              },
            ],
          },
        },
      ],
    }));

    const jobStoreCalc = createInMemoryJobStore();
    const famMockCalc = {
      importActuals: jest.fn(),
      setRules: jest.fn(),
      setBalanceChange: jest.fn(),
      compute: jest.fn(),
      getTable: jest.fn(() => ({ rows: [], columns: [], data: [] })),
    } as any;

    const executorCalc = createCalculationExecutor({
      jobStore: jobStoreCalc,
      loadCalculationInputs: loaderWithCalcRule,
      createFam: () => famMockCalc,
    });

    const jobIdCalc = jobStoreCalc.enqueue({
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
    });

    await executorCalc(jobIdCalc, {
      modelId: 1,
      scenarioId: 11,
      projectionYears: 1,
    });

    const calcRuleMap = famMockCalc.setRules.mock.calls[0][0];
    expect(calcRuleMap['101']?.type).toBe('CALCULATION');
  });
});
