import { FAM } from '../fam/fam';
import type { Account } from '../model/types';

const accountsMaster: Account[] = [
  {
    id: '101',
    AccountName: '売上高',
    GlobalAccountID: 'GA_NET_SALES',
    fs_type: 'PL',
    is_credit: false,
    ua_code: 'UA_NET_SALES',
    is_kpi: true,
    parent_ga_id: 'GA_NET_SALES',
    parent_ga_type: 'aggregate',
    sort_num: 10,
    indent_num: 1,
    ga_code: 'GA-PL-NET-SALES',
    ga_type: 'aggregate',
    ga_name: '売上高',
  },
  {
    id: '102',
    AccountName: '営業利益',
    GlobalAccountID: 'GA_NET_SALES',
    fs_type: 'PL',
    is_credit: false,
    ua_code: 'UA_OP_INCOME',
    is_kpi: true,
    parent_ga_id: 'GA_NET_SALES',
    parent_ga_type: 'aggregate',
    sort_num: 20,
    indent_num: 1,
    ga_code: 'GA-PL-NET-SALES',
    ga_type: 'aggregate',
    ga_name: '売上計系',
  },
  {
    id: '201',
    AccountName: '現金及び現金同等物',
    GlobalAccountID: 'GA_CASH',
    fs_type: 'BS',
    is_credit: false,
    ua_code: 'UA_CASH',
    is_kpi: false,
    parent_ga_id: 'GA_CASH',
    parent_ga_type: 'super_calc',
    sort_num: 5,
    indent_num: 1,
    ga_code: 'GA-BS-CASH',
    ga_type: 'super_calc',
    ga_name: '現金',
  },
];

describe('FAM メタデータ拡張', () => {
  test('importActualsで付与したGAメタがgetTableで保持される', () => {
    const fam = new FAM();
    fam.importActuals(
      [
        {
          '101': 800,
          '102': 120,
          '201': 500,
        },
        {
          '101': 880,
          '102': 135,
          '201': 520,
        },
      ],
      accountsMaster,
      { actualYears: [2023, 2024] }
    );

    const table = fam.getTable({ fs: 'PL', years: [2023, 2024] });

    expect(table.columns).toEqual(['FY:2023', 'FY:2024']);
    const salesRow = table.rows.find((r: any) => r.accountId === '101');
    expect(salesRow?.ua_code).toBe('UA_NET_SALES');
    expect(salesRow?.ga?.ga_code).toBe('GA-PL-NET-SALES');
    expect(salesRow?.parent_ga_type).toBe('aggregate');
    expect(salesRow?.fs_type).toBe('PL');
  });
});
