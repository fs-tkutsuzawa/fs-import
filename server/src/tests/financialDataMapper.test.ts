import { transformToFinancialData } from '../service/financialDataMapper';

type TransformArgs = Parameters<typeof transformToFinancialData>[0];

const table: TransformArgs['table'] = {
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
  columns: ['FY:2023', 'FY:2024'],
  data: [[800, 880]],
};

const periods: TransformArgs['periods'] = [
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
];

describe('financialDataMapper', () => {
  test('FAM行列をV2 financialDataへアンピボットし、期間メタを付与する', () => {
    const result = transformToFinancialData({
      table,
      periods,
      modelId: 1,
      scenarioId: 11,
      currency: 'JPY',
    });

    expect(result.metadata.modelId).toBe(1);
    expect(result.metadata.scenarioId).toBe(11);
    expect(result.metadata.currency).toBe('JPY');
    expect(result.financialData).toHaveLength(2);

    const fy2023 = result.financialData.find(
      (item) => (item as { period_label?: string }).period_label === 'FY2023'
    ) as
      | {
          ua_id?: number;
          value?: number | null;
          period_id?: number;
          global_account?: { ga_code?: string | null } | null;
        }
      | undefined;
    expect(fy2023?.ua_id).toBe(101);
    expect(fy2023?.value).toBe(800);
    expect(fy2023?.period_id).toBe(1);
    expect(fy2023?.global_account?.ga_code).toBe('GA-PL-NET-SALES');
  });

  test('期間メタが見つからない場合はエラーとする', () => {
    expect(() =>
      transformToFinancialData({
        table,
        periods: periods.slice(0, 1),
        modelId: 1,
        scenarioId: 11,
      })
    ).toThrow('期間情報が不足しています: FY:2024');
  });
});
