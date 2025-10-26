import { Account } from '../hooks/useFinancialAccounts';
import { UserAccount } from '../hooks/useUserAccounts';

// --- Dummy Dataset Fallbacks ---
export const DEFAULT_FINANCIAL_ACCOUNTS: Account[] = [
  {
    id: 'GA-PL-ROOT',
    parent_id: null,
    fs_type: 'PL',
    account_name: '損益計算書',
    account_code: 'GA_PL_ROOT',
    account_type: 'aggregate',
    sort_num: 1,
    indent_num: 0,
    is_optional: false,
    isCalculated: false,
    children: [],
    ga_name: '損益計算書',
    ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
    order: 1,
    mapping_type: 'sum_of_children',
  },
  {
    id: 'GA-BS-ROOT',
    parent_id: null,
    fs_type: 'BS',
    account_name: '貸借対照表',
    account_code: 'GA_BS_ROOT',
    account_type: 'aggregate',
    sort_num: 2,
    indent_num: 0,
    is_optional: false,
    isCalculated: false,
    children: [],
    ga_name: '貸借対照表',
    ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
    order: 2,
    mapping_type: 'sum_of_children',
  },
  {
    id: 'GA-CF-ROOT',
    parent_id: null,
    fs_type: 'CF',
    account_name: 'キャッシュフロー計算書',
    account_code: 'GA_CF_ROOT',
    account_type: 'aggregate',
    sort_num: 3,
    indent_num: 0,
    is_optional: false,
    isCalculated: false,
    children: [],
    ga_name: 'キャッシュフロー計算書',
    ga_code: 'GA_CF_ROOT',
    ga_type: 'aggregate',
    order: 3,
    mapping_type: 'sum_of_children',
  },
];

export const DEFAULT_USER_ACCOUNTS: UserAccount[] = [
  {
    id: 1001,
    ua_name: '売上高',
    ua_code: 'UA_PL_REVENUE',
    fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ga_id: 'GA-PL-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-PL-ROOT',
    parent_ga_name: '損益計算書',
    parent_ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 1002,
    ua_name: '売上原価',
    ua_code: 'UA_PL_COGS',
    fs_type: 'PL',
    is_credit: true,
    is_kpi: false,
    parent_ga_id: 'GA-PL-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-PL-ROOT',
    parent_ga_name: '損益計算書',
    parent_ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 1003,
    ua_name: '売上総利益',
    ua_code: 'UA_PL_GROSS_PROFIT',
    fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ga_id: 'GA-PL-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-PL-ROOT',
    parent_ga_name: '損益計算書',
    parent_ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 1004,
    ua_name: '販売費及び一般管理費',
    ua_code: 'UA_PL_SGA',
    fs_type: 'PL',
    is_credit: true,
    is_kpi: false,
    parent_ga_id: 'GA-PL-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-PL-ROOT',
    parent_ga_name: '損益計算書',
    parent_ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 1005,
    ua_name: '営業利益',
    ua_code: 'UA_PL_OPERATING_PROFIT',
    fs_type: 'PL',
    is_credit: false,
    is_kpi: true,
    parent_ga_id: 'GA-PL-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-PL-ROOT',
    parent_ga_name: '損益計算書',
    parent_ga_code: 'GA_PL_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 2001,
    ua_name: '資産合計',
    ua_code: 'UA_BS_TOTAL_ASSETS',
    fs_type: 'BS',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA-BS-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-BS-ROOT',
    parent_ga_name: '貸借対照表',
    parent_ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 2002,
    ua_name: '負債合計',
    ua_code: 'UA_BS_TOTAL_LIABILITIES',
    fs_type: 'BS',
    is_credit: true,
    is_kpi: false,
    parent_ga_id: 'GA-BS-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-BS-ROOT',
    parent_ga_name: '貸借対照表',
    parent_ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 2003,
    ua_name: '純資産合計',
    ua_code: 'UA_BS_TOTAL_NET_ASSETS',
    fs_type: 'BS',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA-BS-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-BS-ROOT',
    parent_ga_name: '貸借対照表',
    parent_ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 2004,
    ua_name: '負債・純資産合計',
    ua_code: 'UA_BS_TOTAL_LIABILITIES_NET_ASSETS',
    fs_type: 'BS',
    is_credit: true,
    is_kpi: false,
    parent_ga_id: 'GA-BS-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-BS-ROOT',
    parent_ga_name: '貸借対照表',
    parent_ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 2005,
    ua_name: 'バランスチェック',
    ua_code: 'UA_BS_BALANCE_CHECK',
    fs_type: 'BS',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA-BS-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-BS-ROOT',
    parent_ga_name: '貸借対照表',
    parent_ga_code: 'GA_BS_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 3001,
    ua_name: '営業活動によるキャッシュフロー',
    ua_code: 'UA_CF_OPERATION',
    fs_type: 'CF',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA-CF-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-CF-ROOT',
    parent_ga_name: 'キャッシュフロー計算書',
    parent_ga_code: 'GA_CF_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 3002,
    ua_name: '投資活動によるキャッシュフロー',
    ua_code: 'UA_CF_INVESTMENT',
    fs_type: 'CF',
    is_credit: true,
    is_kpi: false,
    parent_ga_id: 'GA-CF-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-CF-ROOT',
    parent_ga_name: 'キャッシュフロー計算書',
    parent_ga_code: 'GA_CF_ROOT',
    ga_type: 'aggregate',
  },
  {
    id: 3003,
    ua_name: '財務活動によるキャッシュフロー',
    ua_code: 'UA_CF_FINANCING',
    fs_type: 'CF',
    is_credit: false,
    is_kpi: false,
    parent_ga_id: 'GA-CF-ROOT',
    parent_ua_id: null,
    ga_id: 'GA-CF-ROOT',
    parent_ga_name: 'キャッシュフロー計算書',
    parent_ga_code: 'GA_CF_ROOT',
    ga_type: 'aggregate',
  },
];

// --- Types for API Response (v2 - Enriched Hierarchy) ---
export interface FinancialDataItem {
  ua_id: number;
  ua_name: string;
  ua_code: string | null;
  sort_num: number;
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit: boolean | null;
  is_kpi: boolean;
  global_account: {
    id: string;
    name: string;
    indent_num: number;
  };
  parent_user_account: {
    id: number;
    name: string;
  } | null;
  period_id: number;
  period_label: string;
  af_type: 'Actual' | 'Forecast';
  value: number | null;
  period_key?: string;
  period_type?: 'annual' | 'monthly' | 'adjustment' | 'irregular';
}

export interface FiscalYearConfig {
  startYear: number;
  initialEndMonth: number;
  changes: { year: number; newEndMonth: number }[];
}

type PeriodDefinition = {
  key: string;
  label: string;
  type: 'annual' | 'monthly' | 'adjustment' | 'irregular';
  calendarYear: number;
  month?: number;
  af_type: 'Actual' | 'Forecast';
};

// --- Dummy Data Generation (v2 - Enriched Hierarchy) ---
export const generateDummyFinancialData = (
  financialAccounts: Account[],
  userAccounts: UserAccount[],
  fiscalYearConfig: FiscalYearConfig
): FinancialDataItem[] => {
  const data: FinancialDataItem[] = [];

  const periodDefinitions: PeriodDefinition[] = [];
  const { startYear, initialEndMonth, changes } = fiscalYearConfig;
  let currentEndMonth = initialEndMonth;
  const actualYearThreshold = startYear + 3; // show monthly until this fiscal year

  for (let year = startYear; year <= startYear + 5; year++) {
    const change = changes.find((c) => c.year === year);

    if (change && change.newEndMonth !== currentEndMonth) {
      periodDefinitions.push({
        key: `${year}/${change.newEndMonth}-irregular`,
        label: `${year}年変則決算`,
        type: 'irregular',
        calendarYear: year,
        month: change.newEndMonth,
        af_type: year <= actualYearThreshold ? 'Actual' : 'Forecast',
      });
      currentEndMonth = change.newEndMonth;
      continue;
    }

    const yearLabel = currentEndMonth <= 3 ? year + 1 : year;
    const af_type = yearLabel <= actualYearThreshold ? 'Actual' : 'Forecast';

    periodDefinitions.push({
      key: `${yearLabel}/${currentEndMonth}`,
      label: `${yearLabel}年度`,
      type: 'annual',
      calendarYear: yearLabel,
      month: currentEndMonth,
      af_type,
    });

    if (yearLabel <= actualYearThreshold) {
      const startMonth = (currentEndMonth % 12) + 1;
      for (let i = 0; i < 12; i++) {
        const monthNum = ((startMonth - 1 + i) % 12) + 1;
        const calendarYear = monthNum >= startMonth ? year : year + 1;
        periodDefinitions.push({
          key: `${calendarYear}-${monthNum}`,
          label: `${calendarYear}年${monthNum}月`,
          type: 'monthly',
          calendarYear,
          month: monthNum,
          af_type: 'Actual',
        });
      }
      periodDefinitions.push({
        key: `${year}-adj`,
        label: `${year}年決算調整`,
        type: 'adjustment',
        calendarYear: year,
        af_type: 'Actual',
      });
    }
  }

  userAccounts.forEach((ua, index) => {
    const parentGA = financialAccounts.find(
      (ga) => ga.id === ua.parent_ga_id || ga.ga_code === ua.parent_ga_id
    );

    const parentUA = ua.parent_ua_id
      ? userAccounts.find((u) => u.id === ua.parent_ua_id)
      : null;

    const baseAnnualValue = 45000 + index * 6500;
    const monthlyBase = baseAnnualValue / 12;

    periodDefinitions.forEach((period, periodIndex) => {
      let value: number | null = baseAnnualValue + periodIndex * 900;

      if (period.type === 'monthly') {
        const seasonalFactor = 1 + ((period.month || 1) - 6.5) / 50;
        value = Math.round(monthlyBase * seasonalFactor);
      } else if (period.type === 'adjustment') {
        value = Math.round(
          (index + 1) * 300 * (period.calendarYear - startYear + 1)
        );
      } else if (period.type === 'irregular') {
        value = baseAnnualValue + (index + 1) * 5000;
      }

      data.push({
        ua_id: ua.id,
        ua_name: ua.ua_name,
        ua_code: ua.ua_code || null,
        sort_num: index,
        fs_type: (ua.fs_type || 'PL') as 'PL' | 'BS' | 'CF',
        is_credit: ua.is_credit ?? null,
        is_kpi: ua.is_kpi || false,
        global_account: {
          id: parentGA?.id || 'GA-PL-ROOT',
          name: parentGA?.ga_name || parentGA?.account_name || '損益計算書',
          indent_num: parentGA?.indent_num || 0,
        },
        parent_user_account: parentUA
          ? {
              id: parentUA.id,
              name: parentUA.ua_name,
            }
          : null,
        period_id: periodIndex + 1,
        period_label: period.label,
        af_type: period.af_type,
        value,
        period_key: period.key,
        period_type: period.type,
      });
    });
  });

  return data;
};
