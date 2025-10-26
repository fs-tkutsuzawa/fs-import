import type { UserAccount } from '../hooks/useUserAccounts';
import type { Account } from '../hooks/useFinancialAccounts';

export interface GridColumn {
  key: string;
  name: string;
  width?: number;
  frozen?: boolean;
  info?: string;
  headerClassName?: string;
}

export interface GridRow {
  id: string;
  accountName: string;
  isCalculated?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

interface FinancialDataRecord {
  ua_id: number;
  ua_name?: string;
  ua_code?: string | null;
  fs_type?: 'PL' | 'BS' | 'CF' | string;
  is_credit?: boolean | null;
  is_kpi?: boolean;
  parent_ga_id?: string | null;
  parent_ga_type?: string | null;
  parent_ua_id?: number | null;
  period_id: number;
  period_label: string;
  display_order?: number;
  af_type?: string;
  value: number | null;
  global_account?: {
    id?: string;
    ga_name?: string | null;
    ga_code?: string | null;
    fs_type?: string | null;
    ga_type?: 'super_calc' | 'aggregate' | null;
    is_credit?: boolean | null;
    parent_ga_id?: string | null;
    sort_num?: number | null;
    indent_num?: number | null;
  } | null;
}

interface BuildGridOptions {
  financialData: FinancialDataRecord[];
  userAccounts: UserAccount[];
  financialAccounts: Account[];
}

interface BuildGridResult {
  columns: GridColumn[];
  rowsByTab: Record<string, GridRow[]>;
}

const periodSortKey = (displayOrder?: number, label?: string) => {
  if (typeof displayOrder === 'number') return displayOrder;
  return Number.MAX_SAFE_INTEGER - (label ? label.length : 0);
};

const buildAccountName = (
  record: FinancialDataRecord,
  userAccountMap: Map<number, UserAccount>,
  indent: number
) => {
  const uaName = record.ua_name ?? userAccountMap.get(record.ua_id)?.ua_name;
  const prefix = indent > 0 ? '　'.repeat(indent) : '';
  return `${prefix}${uaName ?? `UA-${record.ua_id}`}`;
};

export const buildGridFromFinancialData = ({
  financialData,
  userAccounts,
  financialAccounts,
}: BuildGridOptions): BuildGridResult => {
  const rowsByTab: Record<string, GridRow[]> = {
    pl: [],
    bs: [],
    cf: [],
    ppe: [],
    financing: [],
    wc: [],
  };

  if (!financialData.length) {
    return {
      columns: [],
      rowsByTab,
    };
  }

  const periods = Array.from(
    new Map(
      financialData.map((item) => [
        item.period_id,
        {
          id: item.period_id,
          label: item.period_label,
          displayOrder: item.display_order ?? undefined,
          afType: item.af_type ?? '',
        },
      ])
    ).values()
  ).sort(
    (a, b) =>
      periodSortKey(a.displayOrder, a.label) -
      periodSortKey(b.displayOrder, b.label)
  );

  const columns: GridColumn[] = [
    { key: 'accountName', name: '勘定科目', width: 220, frozen: true },
    ...periods.map((period) => ({
      key: period.label,
      name: period.label,
      info: period.afType,
      // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 対応コード
      headerClassName:
        period.afType?.toLowerCase() === 'forecast'
          ? 'rdg-header-annual-plan'
          : 'rdg-header-annual-actual',
      width: 140,
    })),
  ];

  const financialAccountMap = new Map<string, Account>();
  financialAccounts.forEach((acc) => financialAccountMap.set(acc.id, acc));

  const userAccountMap = new Map<number, UserAccount>();
  userAccounts.forEach((ua) => userAccountMap.set(ua.id, ua));

  interface RowMeta {
    row: GridRow;
    fsType: 'pl' | 'bs' | 'cf';
    sortKey: number;
  }

  const rowMap = new Map<number, RowMeta>();

  const fsTypeMap: Record<string, 'pl' | 'bs' | 'cf'> = {
    PL: 'pl',
    BS: 'bs',
    CF: 'cf',
  };

  financialData.forEach((item) => {
    const fsType = fsTypeMap[item.fs_type ?? 'PL'] ?? 'pl';
    const existing = rowMap.get(item.ua_id);
    const ga = item.global_account?.id
      ? financialAccountMap.get(item.global_account.id)
      : undefined;
    const indent = item.global_account?.indent_num ?? ga?.indent_num ?? 0;
    const sortNum =
      item.global_account?.sort_num ?? ga?.sort_num ?? Number.MAX_SAFE_INTEGER;

    if (!existing) {
      const accountName = buildAccountName(item, userAccountMap, indent);
      const row: GridRow = {
        id: `ua-${item.ua_id}`,
        accountName,
        isCalculated: false,
      };
      rowMap.set(item.ua_id, {
        row,
        fsType,
        sortKey: sortNum,
      });
    }

    const target = rowMap.get(item.ua_id);
    if (!target) return;

    const periodKey = periods.find((p) => p.id === item.period_id)?.label;
    if (!periodKey) return;

    target.row[periodKey] = item.value;
  });

  const pushRow = (meta: RowMeta) => {
    rowsByTab[meta.fsType].push(meta.row);
  };

  Array.from(rowMap.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .forEach(pushRow);

  return {
    columns,
    rowsByTab,
  };
};
