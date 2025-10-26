interface TableRow {
  accountId: string;
  ua_code?: string | null;
  fs_type?: string;
  is_credit?: boolean | null;
  is_kpi?: boolean;
  parent_ga_id?: string | null;
  parent_ga_type?: string | null;
  parent_ua_id?: number | null;
  ga?: {
    id: string;
    ga_name: string | null;
    ga_code: string | null;
    fs_type: string | null;
    ga_type: string | null;
    is_credit: boolean | null;
    parent_ga_id: string | null;
    sort_num: number | null;
    indent_num: number | null;
  } | null;
}

interface FamTable {
  rows: TableRow[];
  columns: string[];
  data: number[][];
}

interface PeriodMeta {
  id: number;
  scenario_id: number;
  period_label: string;
  display_order: number;
  period_val: string | null;
  period_type: string;
  af_type: string;
}

interface TransformOptions {
  table: FamTable;
  periods: PeriodMeta[];
  modelId: number;
  scenarioId: number;
  currency?: string;
  calculationTimestamp?: string;
}

const normalizeColumnKey = (column: string) => column.trim();

const derivePeriodKey = (period: PeriodMeta) => {
  const label = period.period_label;
  const yearMatch = label.match(/^(FY|ＭＹ)?(\d{4})/i);
  if (yearMatch) {
    return `FY:${yearMatch[2]}`;
  }
  return label;
};

const toNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`accountId を数値に変換できません: ${value}`);
  }
  return parsed;
};

export const transformToFinancialData = ({
  table,
  periods,
  modelId,
  scenarioId,
  currency,
  calculationTimestamp,
}: TransformOptions) => {
  const periodMap = new Map<string, PeriodMeta>();
  for (const period of periods) {
    periodMap.set(normalizeColumnKey(derivePeriodKey(period)), period);
  }

  const financialData: Array<Record<string, unknown>> = [];

  table.rows.forEach((row, rowIndex) => {
    table.columns.forEach((column, columnIndex) => {
      const key = normalizeColumnKey(column);
      const periodMeta = periodMap.get(key);
      if (!periodMeta) {
        throw new Error(`期間情報が不足しています: ${key}`);
      }

      const value = table.data[rowIndex]?.[columnIndex] ?? null;
      const uaId = toNumber(row.accountId);

      const record: Record<string, unknown> = {
        ua_id: uaId,
        ua_name: row.ga?.ga_name ?? null,
        ua_code: row.ua_code ?? null,
        fs_type: row.fs_type ?? null,
        is_credit: row.is_credit ?? null,
        is_kpi: row.is_kpi ?? false,
        parent_ua_id: row.parent_ua_id ?? null,
        parent_ga_id: row.parent_ga_id ?? null,
        parent_ga_type: row.parent_ga_type ?? null,
        period_id: periodMeta.id,
        period_label: periodMeta.period_label,
        period_type: periodMeta.period_type,
        period_val: periodMeta.period_val,
        display_order: periodMeta.display_order,
        af_type: periodMeta.af_type,
        value,
      };

      if (row.ga) {
        record.global_account = {
          id: row.ga.id,
          ga_name: row.ga.ga_name,
          ga_code: row.ga.ga_code,
          fs_type: row.ga.fs_type,
          ga_type: row.ga.ga_type,
          is_credit: row.ga.is_credit,
          parent_ga_id: row.ga.parent_ga_id,
          sort_num: row.ga.sort_num,
          indent_num: row.ga.indent_num,
        };
      } else {
        record.global_account = null;
      }

      financialData.push(record);
    });
  });

  return {
    metadata: {
      modelId,
      scenarioId,
      currency: currency ?? null,
      calculationTimestamp: calculationTimestamp ?? new Date().toISOString(),
    },
    financialData,
  };
};

export type FinancialDataPayload = ReturnType<typeof transformToFinancialData>;
