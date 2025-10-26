import type { IntegratedAccountViewRow } from '../../service/calculationRepositories';

export interface GlobalAccountFixture {
  id: string;
  ga_name: string;
  ga_code: string;
  ga_type: 'super_calc' | 'aggregate';
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit: boolean | null;
  parent_ga_id: string | null;
  sort_num: number;
  indent_num: number;
}

export interface UserAccountFixture {
  id: number;
  ua_name: string;
  ua_code: string | null;
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit: boolean | null;
  is_kpi: boolean;
  parent_ga_id: string;
  parent_ga_type: 'super_calc' | 'aggregate';
  parent_ua_id: number | null;
}

export interface PeriodFixture {
  id: number;
  scenario_id: number;
  period_label: string;
  display_order: number;
  period_val: string | null;
  period_type: 'Yearly' | 'Monthly' | 'Event';
  af_type: 'Actual' | 'Forecast';
}

export interface ImportDfFixture {
  model_id: number;
  df_json: Array<Record<string, number>>;
}

export interface CalculationRuleFixture {
  id: number;
  target_user_account_id: number;
  scenario_id: number;
  period_id: number | null;
  rule_type: 'PARAMETER' | 'BALANCE_AND_CHANGE';
  rule_definition: unknown;
}

export const globalAccountsFixture: GlobalAccountFixture[] = [
  {
    id: 'GA_PL_ROOT',
    ga_name: '損益計算書',
    ga_code: 'GA-PL-ROOT',
    ga_type: 'aggregate',
    fs_type: 'PL',
    is_credit: null,
    parent_ga_id: null,
    sort_num: 1,
    indent_num: 0,
  },
  {
    id: 'GA_NET_SALES',
    ga_name: '売上高',
    ga_code: 'GA-PL-NET-SALES',
    ga_type: 'aggregate',
    fs_type: 'PL',
    is_credit: false,
    parent_ga_id: 'GA_PL_ROOT',
    sort_num: 10,
    indent_num: 1,
  },
  {
    id: 'GA_CASH',
    ga_name: '現金及び現金同等物',
    ga_code: 'GA-BS-CASH',
    ga_type: 'super_calc',
    fs_type: 'BS',
    is_credit: false,
    parent_ga_id: null,
    sort_num: 5,
    indent_num: 1,
  },
];

export const userAccountsFixture: UserAccountFixture[] = [
  {
    id: 101,
    ua_name: '売上高',
    ua_code: 'UA_NET_SALES',
    fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ga_id: 'GA_NET_SALES',
    parent_ga_type: 'aggregate',
    parent_ua_id: null,
  },
  {
    id: 102,
    ua_name: '営業利益',
    ua_code: 'UA_OP_INCOME',
    fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ga_id: 'GA_NET_SALES',
    parent_ga_type: 'aggregate',
    parent_ua_id: null,
  },
  {
    id: 201,
    ua_name: '現金及び現金同等物',
    ua_code: 'UA_CASH',
    fs_type: 'BS',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA_CASH',
    parent_ga_type: 'super_calc',
    parent_ua_id: null,
  },
];

export const periodsFixture: PeriodFixture[] = [
  {
    id: 1,
    scenario_id: 11,
    period_label: 'FY2023',
    display_order: 1,
    period_val: '2023-12-31',
    period_type: 'Yearly',
    af_type: 'Actual',
  },
  {
    id: 2,
    scenario_id: 11,
    period_label: 'FY2024',
    display_order: 2,
    period_val: '2024-12-31',
    period_type: 'Yearly',
    af_type: 'Forecast',
  },
];

export const importDfFixture: ImportDfFixture = {
  model_id: 1,
  df_json: [
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
};

export const calculationRulesFixture: CalculationRuleFixture[] = [
  {
    id: 301,
    target_user_account_id: 102,
    scenario_id: 11,
    period_id: null,
    rule_type: 'PARAMETER',
    rule_definition: {
      type: 'REFERENCE',
      ref: {
        account: { userAccountId: 101 },
        period: 'SAME',
      },
      value: 0.15,
    },
  },
  {
    id: 302,
    target_user_account_id: 201,
    scenario_id: 11,
    period_id: null,
    rule_type: 'BALANCE_AND_CHANGE',
    rule_definition: {
      type: 'CFI',
      target: { gaId: 'GA_CASH' },
      driver: { userAccountId: 102 },
    },
  },
];

export const integratedAccountsViewFixture: IntegratedAccountViewRow[] = [
  {
    source: 'USER_ACCOUNT',
    user_account_id: 101,
    ua_name: '売上高',
    ua_code: 'UA_NET_SALES',
    ua_fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ua_id: null,
    global_account_id: 'GA_NET_SALES',
    ga_name: '売上高',
    ga_code: 'GA-PL-NET-SALES',
    ga_type: 'aggregate',
    ga_fs_type: 'PL',
    ga_is_credit: false,
    sort_num: 10,
    indent_num: 1,
    ga_parent_ga_id: 'GA_PL_ROOT',
  },
  {
    source: 'USER_ACCOUNT',
    user_account_id: 102,
    ua_name: '営業利益',
    ua_code: 'UA_OP_INCOME',
    ua_fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ua_id: null,
    global_account_id: 'GA_NET_SALES',
    ga_name: '売上高',
    ga_code: 'GA-PL-NET-SALES',
    ga_type: 'aggregate',
    ga_fs_type: 'PL',
    ga_is_credit: false,
    sort_num: 10,
    indent_num: 1,
    ga_parent_ga_id: 'GA_PL_ROOT',
  },
  {
    source: 'USER_ACCOUNT',
    user_account_id: 201,
    ua_name: '現金及び現金同等物',
    ua_code: 'UA_CASH',
    ua_fs_type: 'BS',
    is_credit: false,
    is_kpi: false,
    parent_ua_id: null,
    global_account_id: 'GA_CASH',
    ga_name: '現金及び現金同等物',
    ga_code: 'GA-BS-CASH',
    ga_type: 'super_calc',
    ga_fs_type: 'BS',
    ga_is_credit: false,
    sort_num: 5,
    indent_num: 1,
    ga_parent_ga_id: null,
  },
];
