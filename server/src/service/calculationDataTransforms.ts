export interface RawGlobalAccount {
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

export interface RawUserAccount {
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

export interface RawPeriod {
  id: number;
  scenario_id: number;
  period_label: string;
  display_order: number;
  period_val: string | null;
  period_type: 'Yearly' | 'Monthly' | 'Event';
  af_type: 'Actual' | 'Forecast';
}

export interface RawCalculationRule {
  id: number;
  target_user_account_id: number;
  scenario_id: number;
  period_id: number | null;
  rule_type: 'PARAMETER' | 'BALANCE_AND_CHANGE';
  rule_definition: unknown;
}

export interface JoinedAccount {
  id: string;
  ua_id: number;
  ua_name: string;
  ua_code: string | null;
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit: boolean | null;
  is_kpi: boolean;
  parent_ga_id: string;
  parent_ua_id: number | null;
  parent_ga_type: 'super_calc' | 'aggregate';
  ga: RawGlobalAccount;
}

export type OrderedPeriod = RawPeriod;

export interface PartitionedRules {
  parameterRules: RawCalculationRule[];
  balanceChanges: RawCalculationRule[];
}

export const joinAccounts = (
  userAccounts: RawUserAccount[],
  globalAccounts: RawGlobalAccount[]
): JoinedAccount[] => {
  const globalById = new Map(globalAccounts.map((ga) => [ga.id, ga]));

  return userAccounts.map((ua) => {
    const ga = globalById.get(ua.parent_ga_id);
    if (!ga) {
      throw new Error(`親グローバル勘定が見つかりません: ${ua.parent_ga_id}`);
    }

    return {
      id: String(ua.id),
      ua_id: ua.id,
      ua_name: ua.ua_name,
      ua_code: ua.ua_code,
      fs_type: ua.fs_type,
      is_credit: ua.is_credit,
      is_kpi: ua.is_kpi,
      parent_ga_id: ua.parent_ga_id,
      parent_ua_id: ua.parent_ua_id,
      parent_ga_type: ua.parent_ga_type,
      ga,
    } satisfies JoinedAccount;
  });
};

export const buildOrderedPeriods = (periods: RawPeriod[]): OrderedPeriod[] => {
  return [...periods].sort((a, b) => a.display_order - b.display_order);
};

type LegacyImportDf = {
  rows: Array<{
    type?: string;
    label?: string;
    values?: Array<number | string | null>;
  }>;
  periods: string[];
};

const isLegacyImportDf = (value: unknown): value is LegacyImportDf => {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as LegacyImportDf).rows) &&
    Array.isArray((value as LegacyImportDf).periods)
  );
};

const sanitizeNumber = (raw: number | string | null | undefined) => {
  if (raw == null) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const normalized = raw.replace(/,/g, '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const convertLegacyImport = (legacy: LegacyImportDf) => {
  const validPeriods = legacy.periods
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => label && label.toUpperCase() !== 'EOL');

  if (!validPeriods.length) {
    return [] as Array<Record<string, number>>;
  }

  const snapshots = validPeriods.map(() => ({}) as Record<string, number>);

  legacy.rows
    .filter((row) => row?.type === 'Account' && row.label)
    .forEach((row) => {
      validPeriods.forEach(({ index }, periodOrder) => {
        const rawValue = row.values?.[index];
        const numeric = sanitizeNumber(rawValue);
        if (typeof numeric === 'number') {
          snapshots[periodOrder][row.label as string] = numeric;
        }
      });
    });

  return snapshots;
};

export const convertImportDfToPrevs = (importDf: {
  df_json: Array<Record<string, number>> | LegacyImportDf;
}): Array<Record<string, number>> => {
  const payload = importDf.df_json;

  if (Array.isArray(payload)) {
    return payload.map((snapshot) => ({ ...snapshot }));
  }

  if (isLegacyImportDf(payload)) {
    return convertLegacyImport(payload);
  }

  return [];
};

export const partitionCalculationRules = (
  rules: RawCalculationRule[]
): PartitionedRules => {
  const parameterRules: RawCalculationRule[] = [];
  const balanceChanges: RawCalculationRule[] = [];

  for (const rule of rules) {
    if (rule.rule_type === 'BALANCE_AND_CHANGE') {
      balanceChanges.push(rule);
    } else {
      parameterRules.push(rule);
    }
  }

  return { parameterRules, balanceChanges };
};
