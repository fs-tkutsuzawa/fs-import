import { buildGridFromFinancialData } from '../financial-data-transform';

describe('buildGridFromFinancialData', () => {
  test('Forecast列に計画用スタイルを設定する', () => {
    // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 / 4.テスト拡充
    const financialData = [
      {
        ua_id: 101,
        period_id: 1,
        period_label: 'FY2023',
        display_order: 1,
        af_type: 'Actual',
        fs_type: 'PL',
        value: 100,
      },
      {
        ua_id: 101,
        period_id: 2,
        period_label: 'FY2024',
        display_order: 2,
        af_type: 'Forecast',
        fs_type: 'PL',
        value: 120,
      },
    ] as any;

    const { columns, rowsByTab } = buildGridFromFinancialData({
      financialData,
      userAccounts: [],
      financialAccounts: [],
    });

    expect(columns).toHaveLength(3);
    expect(columns[1]?.headerClassName).toBe('rdg-header-annual-actual');
    expect(columns[2]?.headerClassName).toBe('rdg-header-annual-plan');
    expect(rowsByTab.pl[0]?.['FY2024']).toBe(120);
  });
});
