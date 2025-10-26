import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  CSSProperties,
} from 'react';
import RDG, {
  Column as RDGColumn,
  RenderCellProps,
  RenderEditCellProps,
} from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useUserAccounts, type UserAccount } from '../hooks/useUserAccounts';
import {
  useFinancialAccounts,
  type Account,
} from '../hooks/useFinancialAccounts';
import {
  useCalculationRules,
  convertRuleToUIConfig,
} from '../hooks/useCalculationRules';
import type {
  CalculationRule,
  ParameterType,
  ParameterConfig,
  RatioConfig,
  LinkConfig,
  GrowthRateConfig,
  PrevEndPlusChangeConfig,
} from '../types/calculationRules';
import { BackToTopButton } from '../components';
import {
  generateDummyFinancialData,
  DEFAULT_FINANCIAL_ACCOUNTS,
  DEFAULT_USER_ACCOUNTS,
  type FinancialDataItem,
  type FiscalYearConfig,
} from '../data/dummyFinancialData';
import { useCalculationJob } from '../hooks/useCalculationJob';
import { buildGridFromFinancialData } from '../utils/financial-data-transform';

// --- Added Types ---
interface Parameter {
  id: string;
  accountName: string;
  sheet: string;
  parameter: string;
  value: string;
  dependencies: string[];
}

interface AccountTreeNode {
  id: string;
  ga_id?: string | number;
  ua_id?: string | number;
  name: string;
  parent_ga_id: string | number | null;
  parent_ua_id: string | number | null;
  sort_num: number;
  indent_num: number;
  fs_type: string;
  children: AccountTreeNode[];
  isGA: boolean;
}

interface GridRow {
  id: string;
  sheet: string;
  accountName: string;
  parentName: string;
  type:
    | ParameterType
    | 'input'
    | 'custom_calc'
    | 'sum_children'
    | 'prev_end_plus_change';
  value: string | number | null;
  dependency1: string | null;
  dependency2: string | null;
  children: AccountTreeNode[];
  config: ParameterConfig | null;
  isSaving?: boolean;
}

// --- Helper Types ---
interface Column {
  key: string;
  name: string;
  width?: number;
  frozen?: boolean;
  info?: string;
  year?: number;
  isIrregular?: boolean;
  isAnnual?: boolean;
  isExpandable?: boolean;
  parentYear?: number;
  headerClassName?: string;
  headerRenderer?: (props: { column: Column }) => JSX.Element;
}

interface Row {
  id: string;
  accountName: string;
  isRatio?: boolean;
  isCalculated?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

interface Tab {
  id: string;
  title: string;
}

interface TabStructure {
  settings: Tab[];
  deal: Tab[];
  sheet: Tab[];
}

// --- FinancialDataGrid Component using react-data-grid ---
const FinancialDataGrid = ({
  columns,
  rows,
  onCellChange,
  readOnly = false,
}: {
  columns: Column[];
  rows: Row[];
  onCellChange: (rowId: string, colKey: string, value: string) => void;
  readOnly?: boolean;
}) => {
  // Convert our Column format to react-data-grid format
  const rdgColumns: RDGColumn<Row>[] = useMemo(() => {
    return columns.map((col) => {
      const headerClassName =
        // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 対応コード
        col.headerClassName ??
        (col.isIrregular
          ? 'rdg-header-irregular'
          : col.parentYear
            ? 'rdg-header-month'
            : col.isAnnual && col.year && col.year <= 2026
              ? 'rdg-header-annual-actual'
              : col.isAnnual
                ? 'rdg-header-annual-plan'
                : '');
      const rdgCol: RDGColumn<Row> = {
        key: col.key,
        name: col.name,
        width: col.width || 100,
        frozen: col.frozen || false,
        resizable: true,
        headerCellClass: headerClassName,
        renderHeaderCell: col.headerRenderer
          ? (_headerProps) => {
              const content = col.headerRenderer!({ column: col });
              return (
                <div style={{ textAlign: col.frozen ? 'left' : 'center' }}>
                  {content}
                </div>
              );
            }
          : col.info
            ? (_headerProps) => (
                <div style={{ textAlign: col.frozen ? 'left' : 'center' }}>
                  <div>{col.name}</div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#6b7280',
                      fontWeight: 'normal',
                    }}
                  >
                    {col.info}
                  </div>
                </div>
              )
            : (_headerProps) => (
                <div style={{ textAlign: col.frozen ? 'left' : 'center' }}>
                  {col.name}
                </div>
              ),
        renderCell: (props: RenderCellProps<Row>) => {
          const { row, column } = props;
          const value = row[column.key as keyof Row];

          const cellStyle: CSSProperties = {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            backgroundColor: col.parentYear ? '#fef3c733' : 'transparent',
            color:
              row.accountName === 'バランスチェック' && value !== 0
                ? '#ef4444'
                : row.isRatio
                  ? '#6b7280'
                  : '#111827',
            fontWeight:
              (row.accountName === 'バランスチェック' && value !== 0) ||
              row.accountName.startsWith('【') ||
              row.accountName.includes('合計') ||
              row.accountName.includes('利益')
                ? 'bold'
                : 'normal',
            justifyContent: col.frozen ? 'flex-start' : 'flex-end',
          };

          return (
            <div style={cellStyle}>
              {row.isRatio && typeof value === 'number'
                ? `${(value * 100).toFixed(1)}%`
                : typeof value === 'number'
                  ? value.toLocaleString()
                  : value || ''}
            </div>
          );
        },
        renderEditCell:
          !col.frozen && !readOnly
            ? (props) => {
                const { row, column, onClose } = props;
                const value = row[column.key as keyof Row];

                // Skip editing for calculated rows
                if (row.isCalculated) {
                  return null;
                }

                return (
                  <input
                    type="text"
                    defaultValue={
                      typeof value === 'number'
                        ? value.toString()
                        : typeof value === 'string'
                          ? value
                          : ''
                    }
                    onBlur={(e) => {
                      const newValue = e.target.value;
                      onCellChange(row.id, column.key, newValue);
                      onClose(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const newValue = (e.target as HTMLInputElement).value;
                        onCellChange(row.id, column.key, newValue);
                        onClose(true);
                      } else if (e.key === 'Escape') {
                        onClose(false);
                      }
                    }}
                    autoFocus
                    style={{
                      width: '100%',
                      height: '100%',
                      padding: '0 8px',
                      border: 'none',
                      outline: '2px solid #3b82f6',
                      backgroundColor: 'white',
                    }}
                  />
                );
              }
            : undefined,
        editable: (row) => !readOnly && !col.frozen && !row.isCalculated,
        cellClass: (row) => {
          if (row.isCalculated) return 'rdg-cell-readonly';
          if (row.isRatio) return 'rdg-cell-ratio';
          return '';
        },
      };
      return rdgCol;
    });
  }, [columns, onCellChange, readOnly]);

  const gridHeight = rows.length * 35 + 72; // 35px per row + 72px header

  return (
    <div style={{ width: '100%', height: 'auto' }}>
      <style>
        {`
          .rdg {
            font-size: 13px;
            --rdg-background-color: white;
            --rdg-header-background-color: #f9fafb;
            --rdg-row-hover-background-color: #f3f4f6;
            --rdg-selection-color: #dbeafe;
            --rdg-border-color: #e5e7eb;
          }
          .rdg-header-irregular {
            background-color: #fef2f2 !important;
          }
          .rdg-header-month {
            background-color: #fef3c7 !important;
          }
          .rdg-header-annual-actual {
            background-color: #eff6ff !important;
          }
          .rdg-header-annual-plan {
            background-color: #f0fdf4 !important;
          }
          .rdg-cell-readonly {
            background-color: #f3f4f6 !important;
            cursor: default !important;
          }
          .rdg-cell-ratio {
            background-color: #f9fafb !important;
          }
          .rdg-row:nth-child(even) {
            background-color: #fafafa;
          }
        `}
      </style>
      <RDG
        columns={rdgColumns}
        rows={rows}
        headerRowHeight={72}
        className="rdg-light"
        style={{ height: gridHeight }}
      />
    </div>
  );
};

// --- Confirmation Modal for Deletion ---
const ConfirmationModal = ({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1002,
    }}
  >
    <div
      style={{
        backgroundColor: 'white',
        padding: '25px 30px',
        borderRadius: '8px',
        width: '350px',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 20px 0', fontSize: '16px' }}>{message}</p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          はい、削除します
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
);

// --- Parameter Setting Modal ---
const ParameterSettingModal = ({
  isOpen,
  onClose,
  onSave,
  targetParam,
  allParameters,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (param: Parameter) => void;
  targetParam: Parameter | null;
  allParameters: Parameter[];
}) => {
  const [step, setStep] = useState('selectType');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [config, setConfig] = useState<{
    rate?: number;
    targetAccountId?: string;
    dep1?: string;
    dep2?: string;
    op2?: string;
  }>({});

  useEffect(() => {
    if (!targetParam) return;

    setSelectedType(targetParam.parameter || null);

    const initialConfig: any = {};
    if (
      targetParam.parameter === 'GROWTH_RATE' ||
      targetParam.parameter === 'PERCENTAGE'
    ) {
      initialConfig.rate = parseFloat(targetParam.value) || 0;
    }
    if (
      (targetParam.parameter === 'PERCENTAGE' ||
        targetParam.parameter === 'REFERENCE' ||
        targetParam.parameter === 'PROPORTIONATE') &&
      targetParam.dependencies[0]
    ) {
      const dependentParam = allParameters.find(
        (p) => p.accountName === targetParam.dependencies[0]
      );
      initialConfig.targetAccountId = dependentParam ? dependentParam.id : '';
    }
    if (targetParam.parameter === 'CALCULATION') {
      initialConfig.operators = targetParam.dependencies
        .slice(1)
        .map((d: any) => (d ? (d.startsWith('-') ? '-' : '+') : '+'));
    }
    setConfig(initialConfig);

    if (
      targetParam.parameter &&
      targetParam.parameter !== 'INPUT' &&
      targetParam.parameter !== 'CHILDREN_SUM'
    ) {
      setStep('configure');
    } else {
      setStep('selectType');
    }
  }, [targetParam, allParameters]);

  if (!isOpen || !targetParam) return null;

  const paramTypes = [
    { id: 'INPUT', name: 'インプット' },
    { id: 'GROWTH_RATE', name: '成長率' },
    { id: 'PERCENTAGE', name: '割合' },
    { id: 'PROPORTIONATE', name: '連動' },
    { id: 'CHILDREN_SUM', name: '子科目合計' },
    { id: 'CALCULATION', name: '個別計算' },
    { id: 'REFERENCE', name: '参照' },
  ];

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    if (type === 'INPUT' || type === 'CHILDREN_SUM') {
      onSave({
        ...targetParam,
        parameter: type,
        value: '',
        dependencies: Array(6).fill(''),
      });
      onClose();
    } else {
      setStep('configure');
    }
  };

  const handleSave = () => {
    const updatedParam = { ...targetParam };
    updatedParam.parameter = selectedType!;
    updatedParam.dependencies = Array(6).fill('');

    switch (selectedType) {
      case 'GROWTH_RATE':
        updatedParam.value = `${config.rate || 0}%`;
        break;
      case 'PERCENTAGE':
      case 'PROPORTIONATE':
      case 'REFERENCE':
        updatedParam.value =
          selectedType === 'REFERENCE' ? '' : `${config.rate || 0}%`;
        const dependentParam = allParameters.find(
          (p) => p.id === config.targetAccountId
        );
        if (dependentParam) {
          updatedParam.dependencies[0] = dependentParam.accountName;
        }
        break;
      case 'CALCULATION':
        const dep1 = allParameters.find((p) => p.id === config.dep1);
        const dep2 = allParameters.find((p) => p.id === config.dep2);
        if (dep1) updatedParam.dependencies[0] = dep1.accountName;
        if (dep2)
          updatedParam.dependencies[1] = `${config.op2 || '+'}${dep2.accountName}`;
        break;
    }
    onSave(updatedParam);
    onClose();
  };

  const renderConfigForm = () => {
    const selectOptions = allParameters
      .filter((p) => p.id !== targetParam.id)
      .map((p) => (
        <option key={p.id} value={p.id}>
          {p.accountName} ({p.sheet})
        </option>
      ));

    switch (selectedType) {
      case 'GROWTH_RATE':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              成長率 (%)
            </label>
            <input
              type="number"
              value={config.rate || ''}
              onChange={(e) =>
                setConfig({ ...config, rate: parseFloat(e.target.value) || 0 })
              }
              className="mt-1 w-full p-2 border rounded-md"
              placeholder="例: 5"
            />
          </div>
        );
      case 'PERCENTAGE':
      case 'PROPORTIONATE':
      case 'REFERENCE':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                参照科目
              </label>
              <select
                value={config.targetAccountId || ''}
                onChange={(e) =>
                  setConfig({ ...config, targetAccountId: e.target.value })
                }
                className="mt-1 w-full p-2 border rounded-md"
              >
                <option value="">科目を選択...</option>
                {selectOptions}
              </select>
            </div>
            {selectedType !== 'REFERENCE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  割合 (%)
                </label>
                <input
                  type="number"
                  value={config.rate || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      rate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full p-2 border rounded-md"
                  placeholder="例: 50"
                />
              </div>
            )}
          </div>
        );
      case 'CALCULATION':
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">簡単な計算式を設定します。</p>
            <select
              value={config.dep1 || ''}
              onChange={(e) => setConfig({ ...config, dep1: e.target.value })}
              className="mt-1 w-full p-2 border rounded-md"
            >
              <option value="">科目1を選択...</option>
              {selectOptions}
            </select>
            <div className="flex items-center gap-2">
              <select
                value={config.op2 || '+'}
                onChange={(e) => setConfig({ ...config, op2: e.target.value })}
                className="p-2 border rounded-md"
              >
                <option value="+">+</option>
                <option value="-">-</option>
              </select>
              <select
                value={config.dep2 || ''}
                onChange={(e) => setConfig({ ...config, dep2: e.target.value })}
                className="w-full p-2 border rounded-md"
              >
                <option value="">科目2を選択...</option>
                {selectOptions}
              </select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-2">パラメータ設定</h3>
        <p className="text-sm text-gray-600 mb-6">
          「{targetParam.accountName}」の計算方法を
          {step === 'selectType' ? '選択してください。' : '設定してください。'}
        </p>

        {step === 'selectType' ? (
          <div className="grid grid-cols-2 gap-4">
            {paramTypes.map((param) => (
              <button
                key={param.id}
                onClick={() => handleTypeSelect(param.id)}
                className="p-4 border rounded-lg text-center font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-400 transition-colors"
              >
                {param.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="my-4">{renderConfigForm()}</div>
        )}

        <div className="flex justify-between items-center mt-6">
          {step === 'configure' ? (
            <button
              onClick={() => setStep('selectType')}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              他のパラメータ
            </button>
          ) : (
            <div></div>
          )}
          <div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 mr-2"
            >
              キャンセル
            </button>
            {step === 'configure' && (
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                保存
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomCalcModal = ({
  isOpen,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  onSave: (operators: string[]) => void;
  onClose: () => void;
  targetRow: GridRow | null;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1003]">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">
          Custom Calculation (Dummy)
        </h3>
        <p className="mb-4 text-sm">Operators (+/-) for children sum:</p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(['+'])}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Parameter Settings Component ---
const DependencyDetailsModal = ({
  param,
  onClose,
}: {
  param: Parameter;
  onClose: () => void;
}) => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1001,
    }}
  >
    <div
      style={{
        backgroundColor: 'white',
        padding: '20px 30px',
        borderRadius: '8px',
        width: '400px',
      }}
    >
      <h4 style={{ marginTop: 0 }}>依存科目詳細: {param.accountName}</h4>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {param.dependencies.map(
          (dep: any, index: number) =>
            dep && (
              <li
                key={index}
                style={{ padding: '5px 0', borderBottom: '1px solid #eee' }}
              >
                <strong>依存{index + 1}:</strong> {dep}
              </li>
            )
        )}
      </ul>
      <button
        onClick={onClose}
        style={{
          marginTop: '15px',
          width: '100%',
          padding: '8px',
          backgroundColor: '#6b7280',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        閉じる
      </button>
    </div>
  </div>
);

const ParameterGrid = ({
  rules,
  userAccounts,
  financialAccounts,
  saveParameterSetting,
}: {
  rules: Map<string, CalculationRule>;
  userAccounts: UserAccount[];
  financialAccounts: Account[];
  saveParameterSetting: (
    uaId: string,
    type: ParameterType,
    config: ParameterConfig
  ) => Promise<void>;
}) => {
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [updatedRows, setUpdatedRows] = useState<Set<string>>(new Set());
  const [calcModalState, setCalcModalState] = useState<{
    isOpen: boolean;
    rowId: string | null;
  }>({ isOpen: false, rowId: null });
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const accountTree = useMemo(
    () => buildAccountTree(financialAccounts, userAccounts),
    [financialAccounts, userAccounts]
  );

  const flatAccountList = useMemo(
    () => flattenTree(accountTree),
    [accountTree]
  );

  const allAccountsOptions = useMemo(() => {
    return flatAccountList
      .filter((acc) => !acc.isGA)
      .map((acc) => ({
        value: `ua-${acc.ua_id}`,
        label: acc.name,
      }));
  }, [flatAccountList]);

  useEffect(() => {
    const rows: GridRow[] = userAccounts.map((ua) => {
      const rule = rules.get(`ua-${ua.id}`);
      const uiConfig = rule ? convertRuleToUIConfig(rule) : null;

      const node = flatAccountList.find((n) => n.ua_id === ua.id);
      const parentNode = node?.parent_ua_id
        ? flatAccountList.find((n) => n.ua_id === node.parent_ua_id)
        : node?.parent_ga_id
          ? flatAccountList.find((n) => n.ga_id === node.parent_ga_id)
          : null;

      const baseRow: GridRow = {
        id: `ua-${ua.id}`,
        sheet: ua.fs_type || 'PL',
        accountName: ua.ua_name,
        parentName: parentNode?.name || '-',
        type: uiConfig?.type || 'input',
        value: null,
        dependency1: null,
        dependency2: null,
        children: node?.children || [],
        config: uiConfig?.config || null,
      };

      if (uiConfig) {
        const { type, config } = uiConfig;

        if (type === 'growth_rate' && 'rate' in config) {
          baseRow.value = (config as GrowthRateConfig).rate;
        } else if (type === 'ratio' && 'ratio' in config) {
          baseRow.value = (config as RatioConfig).ratio;
          baseRow.dependency1 = (config as RatioConfig).targetAccountId;
        } else if (type === 'link') {
          baseRow.dependency1 = (config as LinkConfig).targetAccountId;
        }
      }

      return baseRow;
    });

    setGridRows(rows);
  }, [userAccounts, financialAccounts, rules, flatAccountList]);

  const handleRowsChange = useCallback(
    (rows: GridRow[], { indexes }: { indexes: number[] }) => {
      setGridRows(rows);
      const newUpdatedRows = new Set(updatedRows);
      indexes.forEach((i) => newUpdatedRows.add(rows[i].id));
      setUpdatedRows(newUpdatedRows);
    },
    [updatedRows]
  );

  const handleCustomCalcSave = useCallback(
    (operators: string[]) => {
      if (!calcModalState.rowId) return;

      const newRows = gridRows.map((r) => {
        if (r.id === calcModalState.rowId) {
          return { ...r, config: { operators } };
        }
        return r;
      });

      setGridRows(newRows);
      const newUpdatedRows = new Set(updatedRows);
      newUpdatedRows.add(calcModalState.rowId);
      setUpdatedRows(newUpdatedRows);
      setCalcModalState({ isOpen: false, rowId: null });
    },
    [calcModalState.rowId, gridRows, updatedRows]
  );

  const handleSaveRow = useCallback(
    async (rowId: string) => {
      setStatusMessage(null);
      setGridRows((rows) =>
        rows.map((r) => (r.id === rowId ? { ...r, isSaving: true } : r))
      );

      const row = gridRows.find((r) => r.id === rowId);

      if (!row) {
        setStatusMessage({ type: 'error', message: '行が見つかりません。' });
        setGridRows((rows) =>
          rows.map((r) => (r.id === rowId ? { ...r, isSaving: false } : r))
        );

        return;
      }

      let config: ParameterConfig = {};

      const type = row.type;

      try {
        switch (type) {
          case 'growth_rate':
            config = { rate: parseFloat(row.value as string) || 0 };

            break;

          case 'ratio':
            config = {
              ratio: parseFloat(row.value as string) || 0,
              targetAccountId: row.dependency1 || '',
            };

            break;

          case 'link':
            config = { targetAccountId: row.dependency1 || '' };

            break;

          case 'sum_children':

          // falls through

          case 'custom_calc':

          // falls through

          case 'prev_end_plus_change':
            config = row.config || {};

            break;

          case 'input':

          default:
            config = {};

            break;
        }

        await saveParameterSetting(row.id, type as any, config);

        setUpdatedRows((prev) => {
          const newSet = new Set(prev);

          newSet.delete(rowId);

          return newSet;
        });
        setStatusMessage({
          type: 'success',
          message: `「${row.accountName}」を保存しました。`,
        });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : '不明なエラーが発生しました。';
        setStatusMessage({
          type: 'error',
          message: `保存エラー: ${errorMessage}`,
        });
      } finally {
        setGridRows((rows) =>
          rows.map((r) => (r.id === rowId ? { ...r, isSaving: false } : r))
        );
      }
    },
    [gridRows, saveParameterSetting]
  );

  const paramTypeNames: { [key: string]: string } = {
    input: 'インプット',

    growth_rate: '成長率',

    ratio: '割合',

    link: '連動',

    sum_children: '子科目合計',

    custom_calc: '個別計算',

    prev_end_plus_change: '前期末+変動',
  };

  const getFormulaString = useCallback((row: GridRow) => {
    if (
      row.type !== 'custom_calc' ||
      !row.children ||
      row.children.length === 0
    )
      return '';

    const operators = (row.config as any)?.operators || [];

    return row.children.reduce((acc: any, child: any, index: number) => {
      if (index === 0) return child.name;

      const op = operators[index - 1] || '+';

      return `${acc} ${op} ${child.name}`;
    }, '');
  }, []);

  const columns: readonly RDGColumn<GridRow>[] = useMemo(
    () => [
      { key: 'sheet', name: 'シート', width: 80, resizable: true },

      { key: 'accountName', name: '科目名', width: 200, resizable: true },

      { key: 'parentName', name: '親科目', width: 150, resizable: true },

      {
        key: 'type',

        name: 'タイプ',

        width: 150,

        resizable: true,

        renderCell: (props: RenderCellProps<GridRow>) => {
          return (
            <span>{paramTypeNames[props.row.type] || props.row.type}</span>
          );
        },

        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          return (
            <select
              className="w-full h-full p-1 border rounded-md"
              value={props.row.type}
              onChange={(e) => {
                const newType = e.target.value as ParameterType;

                props.onRowChange(
                  {
                    ...props.row,
                    type: newType,
                    value: null,
                    dependency1: null,
                    dependency2: null,
                    config: null,
                  },
                  true
                );
              }}
              autoFocus
            >
              {Object.entries(paramTypeNames).map(([key, name]) => (
                <option
                  key={key}
                  value={key}
                  disabled={
                    key === 'prev_end_plus_change' && props.row.sheet !== 'BS'
                  }
                >
                  {name}
                </option>
              ))}
            </select>
          );
        },
      },

      {
        key: 'value',

        name: 'パラメータ値',

        width: 200,

        resizable: true,

        renderCell: (props: RenderCellProps<GridRow>) => {
          if (props.row.type === 'custom_calc') {
            return (
              <div className="flex items-center justify-between h-full">
                <span className="text-xs text-gray-500 truncate">
                  {getFormulaString(props.row)}
                </span>

                <button
                  onClick={() =>
                    setCalcModalState({ isOpen: true, rowId: props.row.id })
                  }
                  className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 py-0.5 ml-2"
                >
                  編集
                </button>
              </div>
            );
          }

          return <span>{props.row.value}</span>;
        },

        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          const isEditable =
            props.row.type === 'growth_rate' || props.row.type === 'ratio';

          if (props.row.type === 'custom_calc') return null; // Use modal instead

          return (
            <input
              type="text"
              className="w-full h-full p-1 border rounded-md disabled:bg-gray-100"
              value={props.row.value ?? ''}
              disabled={!isEditable}
              onChange={(e) =>
                props.onRowChange({ ...props.row, value: e.target.value }, true)
              }
              autoFocus
            />
          );
        },
      },

      {
        key: 'dependency1',

        name: '依存科目1',

        width: 200,

        resizable: true,

        renderCell: (props: RenderCellProps<GridRow>) => {
          if (!props.row.dependency1) return null;

          const account = allAccountsOptions.find(
            (opt) => opt.value === props.row.dependency1
          );

          return <span>{account?.label || props.row.dependency1}</span>;
        },

        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          const isEditable =
            props.row.type === 'ratio' || props.row.type === 'link';

          return (
            <select
              className="w-full h-full p-1 border rounded-md disabled:bg-gray-100"
              value={props.row.dependency1 || ''}
              disabled={!isEditable}
              onChange={(e) => {
                console.log('Dependency changed:', e.target.value);

                props.onRowChange(
                  { ...props.row, dependency1: e.target.value },
                  true
                );
              }}
              autoFocus
            >
              <option value="">科目を選択...</option>

              {allAccountsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        },
      },

      {
        key: 'dependency2',

        name: '依存科目2',

        width: 200,

        resizable: true,

        renderCell: (props: RenderCellProps<GridRow>) => {
          if (props.row.type === 'prev_end_plus_change' && props.row.config) {
            const flowConfig = props.row.config as PrevEndPlusChangeConfig;

            if (flowConfig.flows && flowConfig.flows.length > 0) {
              return (
                <span className="text-xs text-gray-600">
                  {flowConfig.flows.length} 個のフロー
                </span>
              );
            }
          }

          return null;
        },
      },

      {
        key: 'actions',

        name: 'アクション',

        width: 120,

        renderCell: (props: RenderCellProps<GridRow>) => {
          const isUpdated = updatedRows.has(props.row.id);

          const isSaving = props.row.isSaving;

          return (
            <div className="flex flex-col items-center justify-center h-full">
              <button
                onClick={() => handleSaveRow(props.row.id)}
                disabled={!isUpdated || isSaving}
                className="px-4 py-1 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          );
        },
      },
    ],
    [
      allAccountsOptions,
      updatedRows,
      handleSaveRow,
      paramTypeNames,
      getFormulaString,
      setCalcModalState,
    ]
  );

  const editingRow =
    gridRows.find((r) => r.id === calcModalState.rowId) || null;

  return (
    <div style={{ padding: '20px', backgroundColor: 'white' }}>
      <CustomCalcModal
        isOpen={calcModalState.isOpen}
        onClose={() => setCalcModalState({ isOpen: false, rowId: null })}
        onSave={handleCustomCalcSave}
        targetRow={editingRow}
      />

      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold">パラメータ一括設定</h3>
      </div>
      {statusMessage && (
        <div
          className={`p-2 mb-4 rounded-md text-sm ${statusMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
        >
          {statusMessage.message}
        </div>
      )}

      <RDG
        columns={columns}
        rows={gridRows}
        onRowsChange={handleRowsChange}
        className="rdg-light h-auto"
        rowHeight={35}
      />
    </div>
  );
};

// --- Helper Functions for Building Tree Structure ---
const buildAccountTree = (
  financialAccounts: Account[],
  userAccounts: UserAccount[]
): AccountTreeNode[] => {
  const gaNodes: AccountTreeNode[] = financialAccounts
    .filter(
      (ga) => ga.fs_type === 'PL' || ga.fs_type === 'BS' || ga.fs_type === 'CF'
    )
    .map((ga) => ({
      id: `ga-${ga.id}`,
      ga_id: ga.id,
      name: ga.ga_name || ga.account_name || '',
      parent_ga_id: null,
      parent_ua_id: null,
      sort_num: ga.order || 0,
      indent_num: ga.indent_num || 0,
      fs_type: ga.fs_type || 'PL',
      children: [],
      isGA: true,
    }));

  const uaNodes: AccountTreeNode[] = userAccounts.map((ua, index) => ({
    id: `ua-${ua.id}`,
    ua_id: ua.id,
    name: ua.ua_name,
    parent_ga_id: ua.parent_ga_id,
    parent_ua_id: ua.parent_ua_id,
    sort_num: index,
    indent_num: 1,
    fs_type: ua.fs_type || 'PL',
    children: [],
    isGA: false,
  }));

  const nodeMap = new Map<string, AccountTreeNode>();
  [...gaNodes, ...uaNodes].forEach((node) => nodeMap.set(node.id, node));

  // Build tree structure
  const rootNodes: AccountTreeNode[] = [];

  gaNodes.forEach((ga) => {
    rootNodes.push(ga);
  });

  uaNodes.forEach((ua) => {
    if (ua.parent_ua_id) {
      const parentUA = nodeMap.get(`ua-${ua.parent_ua_id}`);
      if (parentUA) {
        parentUA.children.push(ua);
        ua.indent_num = parentUA.indent_num + 1;
      }
    } else if (ua.parent_ga_id) {
      const parentGA = nodeMap.get(`ga-${ua.parent_ga_id}`);
      if (parentGA) {
        parentGA.children.push(ua);
        ua.indent_num = parentGA.indent_num + 1;
      }
    }
  });

  // Sort children by sort_num
  const sortChildren = (node: AccountTreeNode) => {
    node.children.sort((a: any, b: any) => a.sort_num - b.sort_num);
    node.children.forEach(sortChildren);
  };

  rootNodes.forEach(sortChildren);
  rootNodes.sort((a, b) => a.sort_num - b.sort_num);

  return rootNodes;
};

const flattenTree = (nodes: AccountTreeNode[]): AccountTreeNode[] => {
  const result: AccountTreeNode[] = [];
  const traverse = (node: AccountTreeNode) => {
    result.push(node);
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return result;
};

const buildRowsByTab = (
  flatAccountList: AccountTreeNode[],
  dummyFinancialData: FinancialDataItem[],
  fiscalYearConfig: FiscalYearConfig
): { [key: string]: Row[] } => {
  const rowsByTab: { [key: string]: Row[] } = {
    pl: [],
    bs: [],
    cf: [],
    ppe: [],
    financing: [],
    wc: [],
  };

  if (!flatAccountList.length || !dummyFinancialData.length) {
    rowsByTab.ppe = [createRow('準備中 - データがありません')];
    rowsByTab.financing = [createRow('準備中 - データがありません')];
    rowsByTab.wc = [createRow('準備中 - データがありません')];
    return rowsByTab;
  }

  const assignAccountValues = (row: Row, account: AccountTreeNode) => {
    if (account.isGA || !account.ua_id) return;

    const accountData = dummyFinancialData.filter(
      (d) => d.ua_id === account.ua_id
    );

    accountData.forEach((data) => {
      if (data.period_key) {
        row[data.period_key] = data.value;
      } else {
        const fallbackYear = fiscalYearConfig.startYear + data.period_id;
        const fallbackKey = `${fallbackYear}/${fiscalYearConfig.initialEndMonth}`;
        row[fallbackKey] = data.value;
      }
    });
  };

  const plAccounts = flatAccountList.filter((acc) => acc.fs_type === 'PL');
  const bsAccounts = flatAccountList.filter((acc) => acc.fs_type === 'BS');
  const cfAccounts = flatAccountList.filter((acc) => acc.fs_type === 'CF');

  plAccounts.forEach((account) => {
    const row: Row = {
      id: account.id,
      accountName:
        '　'.repeat(account.indent_num) +
        (account.isGA ? `【${account.name}】` : account.name),
      isCalculated: account.isGA,
    };

    assignAccountValues(row, account);
    rowsByTab.pl.push(row);
  });

  bsAccounts.forEach((account) => {
    const row: Row = {
      id: account.id,
      accountName:
        '　'.repeat(account.indent_num) +
        (account.isGA ? `【${account.name}】` : account.name),
      isCalculated: account.isGA,
    };

    assignAccountValues(row, account);
    rowsByTab.bs.push(row);
  });

  cfAccounts.forEach((account) => {
    const row: Row = {
      id: account.id,
      accountName:
        '　'.repeat(account.indent_num) +
        (account.isGA ? `【${account.name}】` : account.name),
      isCalculated: account.isGA,
    };

    assignAccountValues(row, account);
    rowsByTab.cf.push(row);
  });

  if (!rowsByTab.ppe.length) {
    rowsByTab.ppe = [createRow('準備中 - データがありません')];
  }
  if (!rowsByTab.financing.length) {
    rowsByTab.financing = [createRow('準備中 - データがありません')];
  }
  if (!rowsByTab.wc.length) {
    rowsByTab.wc = [createRow('準備中 - データがありません')];
  }

  return rowsByTab;
};

// --- Data Generation and Logic ---
const createRow = (accountName: string): Row => {
  const row: Row = {
    id: `row-${Math.random().toString(36).substr(2, 9)}`,
    accountName,
  };
  for (let year = 2024; year <= 2028; year++) {
    row[`${year}/3`] = Math.floor(Math.random() * 100000 + 50000);
    row[`${year}/6`] = Math.floor(Math.random() * 100000 + 50000);
  }
  for (let year = 2023; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      row[`${year}-${month}`] = Math.floor(Math.random() * 10000 + 1000);
    }
    row[`${year}-adj`] = Math.floor(Math.random() * 5000 - 2500);
  }
  row['2026/6-irregular'] = Math.floor(Math.random() * 30000 + 10000);
  return row;
};

const generateColumns = (
  fiscalYearConfig: FiscalYearConfig,
  expandedYears: Set<number>,
  toggleMonthView: (year: number) => void
): Column[] => {
  const { startYear, initialEndMonth, changes } = fiscalYearConfig;
  const columns: Column[] = [];
  let currentEndMonth = initialEndMonth;

  for (let year = startYear; year <= startYear + 5; year++) {
    const change = changes.find((c) => c.year === year);
    if (change && change.newEndMonth !== currentEndMonth) {
      const irregularStartMonth = (currentEndMonth % 12) + 1;
      const irregularEndMonth = change.newEndMonth;
      const monthCount =
        irregularEndMonth >= irregularStartMonth
          ? irregularEndMonth - irregularStartMonth + 1
          : 12 - irregularStartMonth + 1 + irregularEndMonth;

      columns.push({
        key: `${year}/${change.newEndMonth}-irregular`,
        name: `${year}/${change.newEndMonth}`,
        info: `変則 (${monthCount}ヶ月)`,
        year,
        isIrregular: true,
        width: 120,
      });
      currentEndMonth = change.newEndMonth;
    } else {
      const yearLabel = currentEndMonth <= 3 ? year + 1 : year;
      const isExpandable = yearLabel <= 2026;

      columns.push({
        key: `${yearLabel}/${currentEndMonth}`,
        name: `${yearLabel}/${currentEndMonth}`,
        info: yearLabel <= 2026 ? '実績' : '計画',
        year: yearLabel,
        isAnnual: true,
        isExpandable,
        width: 150,
        headerRenderer: isExpandable
          ? (props) => (
              <div>
                <div>{props.column.name}</div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>
                  {props.column.info}
                </div>
                <button
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    marginTop: '4px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMonthView(props.column.year!);
                  }}
                >
                  {expandedYears.has(props.column.year!)
                    ? '月次を閉じる'
                    : '月次を開く'}
                </button>
              </div>
            )
          : undefined,
      });

      if (isExpandable && expandedYears.has(yearLabel)) {
        // Generate month columns based on fiscal year end month
        // Fiscal year starts from the month after endMonth
        const startMonth = (currentEndMonth % 12) + 1; // e.g. end=3 => start=4
        const monthColumns = Array.from({ length: 12 }, (_, i) => {
          const monthNum = ((startMonth - 1 + i) % 12) + 1; // 1..12
          const monthName = `${monthNum}月`;
          // Calendar year: months from startMonth..12 belong to `year`,
          // months from 1..endMonth belong to `year + 1`.
          const calendarYear = monthNum >= startMonth ? year : year + 1;
          return {
            key: `${calendarYear}-${monthNum}`,
            name: monthName,
            info: '月次',
            parentYear: yearLabel,
            width: 80,
          } as Column;
        });
        monthColumns.push({
          key: `${year}-adj`,
          name: '決算調整',
          info: '調整',
          parentYear: yearLabel,
          width: 90,
        });
        columns.push(...monthColumns);
      }
    }
  }
  return [
    { key: 'accountName', name: '勘定科目', width: 200, frozen: true },
    ...columns,
  ];
};

const ChangeFiscalYearModal = ({
  config,
  setConfig,
  closeModal,
}: {
  config: FiscalYearConfig;
  setConfig: (config: FiscalYearConfig) => void;
  closeModal: () => void;
}) => {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);

  const handleSubmit = () => {
    const newChange = { year, newEndMonth: month };
    const otherChanges = config.changes.filter((c) => c.year !== year);
    setConfig({
      ...config,
      changes: [...otherChanges, newChange].sort((a, b) => a.year - b.year),
    });
    closeModal();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          width: '400px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>期中で決算期を変更</h3>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            変更する年:
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            {[2023, 2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            変更後の決算月:
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
          例: 2026年に6月へ変更すると、26/4-26/6が変則決算期として設定されます
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            設定
          </button>
          <button
            onClick={closeModal}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
const FinancialModel = () => {
  const [companyName] = useState('株式会社サンプル企業');
  const [modelName] = useState('財務予測モデル');
  const [modelVersion] = useState('v3.0');
  const [fiscalYearConfig, setFiscalYearConfig] = useState<FiscalYearConfig>({
    startYear: 2023,
    initialEndMonth: 3,
    changes: [{ year: 2026, newEndMonth: 6 }],
  });
  const [isFiscalYearModalOpen, setIsFiscalYearModalOpen] = useState(false);
  const [expandedYears, setExpandedYears] = useState(new Set<number>());

  const [parameters, setParameters] = useState<Parameter[]>([]);

  // Add hooks for UA and GA data
  const { userAccounts } = useUserAccounts();
  const { accounts: financialAccounts } = useFinancialAccounts();
  const {
    startCalculation,
    status: calculationStatus,
    data: calculationResult,
    error: calculationError,
    isLoading: calculationLoading,
    reset: resetCalculation,
  } = useCalculationJob();
  const [modelId, setModelId] = useState(1);
  const [scenarioId, setScenarioId] = useState(1);
  const { rules, saveParameterSetting } = useCalculationRules({ scenarioId });
  const [projectionYears, setProjectionYears] = useState(3);
  const [apiColumns, setApiColumns] = useState<Column[] | null>(null);
  const [isUsingApiData, setIsUsingApiData] = useState(false);

  const effectiveFinancialAccounts = useMemo(() => {
    const hasFinancialData = financialAccounts.length > 0;
    const hasUserData = userAccounts.length > 0;

    if (!hasFinancialData || !hasUserData) {
      return DEFAULT_FINANCIAL_ACCOUNTS;
    }

    return financialAccounts;
  }, [financialAccounts, userAccounts]);

  const effectiveUserAccounts = useMemo(() => {
    return userAccounts.length ? userAccounts : DEFAULT_USER_ACCOUNTS;
  }, [userAccounts]);

  const isUsingDummyData =
    !isUsingApiData && (!financialAccounts.length || !userAccounts.length);

  const [isParamModalOpen, setIsParamModalOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<Parameter | null>(null);

  const handleCloseParamModal = () => {
    setIsParamModalOpen(false);
    setEditingParam(null);
  };

  const handleSaveParam = (updatedParam: Parameter) => {
    setParameters(
      parameters.map((p: any) => (p.id === updatedParam.id ? updatedParam : p))
    );
    handleCloseParamModal();
  };

  const [tabStructure, setTabStructure] = useState<TabStructure>({
    settings: [
      { id: 'settings', title: '基本設定' },
      { id: 'params', title: 'パラメータ設定' },
    ],
    deal: [
      { id: 'tx', title: 'トランザクション' },
      { id: 'valuation', title: 'バリュエーション' },
      { id: 'lbo', title: 'LBO' },
    ],
    sheet: [
      { id: 'pl', title: 'PL' },
      { id: 'bs', title: 'BS' },
      { id: 'cf', title: 'CF' },
      { id: 'ppe', title: 'PP&E' },
      { id: 'financing', title: 'Financing' },
      { id: 'wc', title: 'Working Capital' },
    ],
  });
  const [activeTabId, setActiveTabId] = useState('pl');
  const [draggedTab, setDraggedTab] = useState<
    (Tab & { group: string }) | null
  >(null);

  // Generate dummy data based on API response structure
  const dummyFinancialData = useMemo(
    () =>
      generateDummyFinancialData(
        effectiveFinancialAccounts,
        effectiveUserAccounts,
        fiscalYearConfig
      ),
    [effectiveFinancialAccounts, effectiveUserAccounts, fiscalYearConfig]
  );

  // Build tree structure and flatten it for display
  const accountTree = useMemo(
    () => buildAccountTree(effectiveFinancialAccounts, effectiveUserAccounts),
    [effectiveFinancialAccounts, effectiveUserAccounts]
  );

  const flatAccountList = useMemo(
    () => flattenTree(accountTree),
    [accountTree]
  );

  const baseRowsByTab = useMemo(
    () => buildRowsByTab(flatAccountList, dummyFinancialData, fiscalYearConfig),
    [flatAccountList, dummyFinancialData, fiscalYearConfig]
  );

  // Convert dummy data to rows grouped by tab
  const [rowsByTab, setRowsByTab] = useState<{ [key: string]: Row[] }>(
    () => baseRowsByTab
  );

  useEffect(() => {
    if (!isUsingApiData) {
      setRowsByTab(baseRowsByTab);
    }
  }, [baseRowsByTab, isUsingApiData]);

  useEffect(() => {
    if (calculationStatus === 'COMPLETED' && calculationResult) {
      const financialRecords = Array.isArray(calculationResult.financialData)
        ? (calculationResult.financialData as Record<string, unknown>[])
        : [];
      const { columns: generatedColumns, rowsByTab: apiRows } =
        buildGridFromFinancialData({
          financialData: financialRecords as any,
          userAccounts: effectiveUserAccounts,
          financialAccounts: effectiveFinancialAccounts,
        });

      setApiColumns(generatedColumns as Column[]);
      setRowsByTab(apiRows);
      setIsUsingApiData(true);
    }
  }, [
    calculationStatus,
    calculationResult,
    effectiveFinancialAccounts,
    effectiveUserAccounts,
  ]);

  const toggleMonthView = useCallback((year: number) => {
    setExpandedYears((prev) => {
      const newSet = new Set(prev);
      newSet.has(year) ? newSet.delete(year) : newSet.add(year);
      return newSet;
    });
  }, []);

  const columns = useMemo(() => {
    if (apiColumns && isUsingApiData) {
      return apiColumns;
    }
    return generateColumns(fiscalYearConfig, expandedYears, toggleMonthView);
  }, [
    apiColumns,
    expandedYears,
    fiscalYearConfig,
    isUsingApiData,
    toggleMonthView,
  ]);

  const handleCellChange = useCallback(
    (rowId: string, colKey: string, value: string) => {
      if (isUsingApiData) return;
      setRowsByTab((prev) => {
        const newRows = { ...prev };
        newRows[activeTabId] = newRows[activeTabId].map((row) => {
          if (row.id === rowId) {
            return {
              ...row,
              [colKey]: isNaN(parseFloat(value)) ? value : Number(value),
            };
          }
          return row;
        });
        return newRows;
      });
    },
    [activeTabId, isUsingApiData]
  );

  const handleStartCalculation = useCallback(() => {
    setIsUsingApiData(false);
    setApiColumns(null);
    setRowsByTab(baseRowsByTab);
    startCalculation({
      modelId,
      scenarioId,
      projectionYears,
    });
  }, [baseRowsByTab, modelId, projectionYears, scenarioId, startCalculation]);

  const handleClearCalculation = useCallback(() => {
    setIsUsingApiData(false);
    setApiColumns(null);
    resetCalculation();
    setRowsByTab(baseRowsByTab);
  }, [baseRowsByTab, resetCalculation]);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    tab: Tab,
    group: string
  ) => {
    setDraggedTab({ ...tab, group });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) =>
    e.preventDefault();

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetTab: Tab,
    group: string
  ) => {
    e.preventDefault();
    if (
      !draggedTab ||
      draggedTab.group !== group ||
      draggedTab.id === targetTab.id
    )
      return;

    setTabStructure((prev) => {
      const newStructure = { ...prev };
      const newTabs = [...newStructure[group as keyof TabStructure]];
      const draggedIndex = newTabs.findIndex((t) => t.id === draggedTab.id);
      const targetIndex = newTabs.findIndex((t) => t.id === targetTab.id);
      newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, draggedTab);
      (newStructure[group as keyof TabStructure] as Tab[]) = newTabs;
      return newStructure;
    });
    setDraggedTab(null);
  };

  const displayRows = useMemo(() => {
    const currentRows = rowsByTab[activeTabId] || [];
    if (!currentRows.length) return [];
    if (isUsingApiData) return currentRows;

    if (activeTabId === 'pl') {
      const processedRows: Row[] = [];
      const salesRow = currentRows.find((r) => r.accountName === '売上高');
      if (!salesRow) return currentRows;

      currentRows.forEach((row) => {
        processedRows.push(row);
        if (
          ['売上総利益', '営業利益', '経常利益', '当期純利益'].includes(
            row.accountName
          )
        ) {
          const ratioRow: Row = {
            id: `${row.id}-ratio`,
            accountName: '対売上高',
            isRatio: true,
            isCalculated: true,
          };
          Object.keys(row).forEach((key) => {
            if (key !== 'id' && key !== 'accountName') {
              const salesValue =
                typeof salesRow[key] === 'number'
                  ? (salesRow[key] as number)
                  : 0;
              const profitValue =
                typeof row[key] === 'number' ? (row[key] as number) : 0;
              ratioRow[key] = salesValue !== 0 ? profitValue / salesValue : 0;
            }
          });
          processedRows.push(ratioRow);
        }
      });
      return processedRows;
    }

    if (activeTabId === 'bs') {
      const newRows = [...currentRows];
      const assets = newRows.find((r) => r.accountName === '資産合計');
      const liab = newRows.find((r) => r.accountName === '負債合計');
      const netAssets = newRows.find((r) => r.accountName === '純資産合計');
      const totalLiabNetAssets = newRows.find(
        (r) => r.accountName === '負債・純資産合計'
      );
      const balanceCheck = newRows.find(
        (r) => r.accountName === 'バランスチェック'
      );

      if (assets && liab && netAssets && totalLiabNetAssets && balanceCheck) {
        Object.keys(assets).forEach((key) => {
          if (key !== 'id' && key !== 'accountName') {
            const liabValue =
              typeof liab[key] === 'number' ? (liab[key] as number) : 0;
            const netAssetsValue =
              typeof netAssets[key] === 'number'
                ? (netAssets[key] as number)
                : 0;
            const assetsValue =
              typeof assets[key] === 'number' ? (assets[key] as number) : 0;
            const totalLNA = liabValue + netAssetsValue;
            totalLiabNetAssets[key] = totalLNA;
            balanceCheck[key] = assetsValue - totalLNA;
          }
        });
        totalLiabNetAssets.isCalculated = true;
        balanceCheck.isCalculated = true;
      }
      return newRows;
    }

    return currentRows;
  }, [rowsByTab, activeTabId, isUsingApiData]);

  const TabBar = ({
    tabs,
    group,
    title,
  }: {
    tabs: Tab[];
    group: string;
    title: string;
  }) => (
    <div
      style={{
        padding: '5px 20px',
        backgroundColor: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: '600',
          color: '#4b5563',
          marginRight: '15px',
        }}
      >
        {title}:
      </span>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          draggable
          onDragStart={(e) => handleDragStart(e, tab, group)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, tab, group)}
          onClick={() => setActiveTabId(tab.id)}
          style={{
            display: 'inline-block',
            padding: '6px 16px',
            cursor: 'pointer',
            borderBottom:
              activeTabId === tab.id
                ? '2px solid #3b82f6'
                : '2px solid transparent',
            color: activeTabId === tab.id ? '#3b82f6' : '#6b7280',
            fontWeight: activeTabId === tab.id ? '600' : 'normal',
            transition: 'all 0.2s',
            userSelect: 'none',
          }}
        >
          {tab.title}
        </div>
      ))}
    </div>
  );

  const activeTabContent = useMemo(() => {
    if (activeTabId === 'params') {
      return (
        <ParameterGrid
          rules={rules}
          userAccounts={effectiveUserAccounts}
          financialAccounts={effectiveFinancialAccounts}
          saveParameterSetting={saveParameterSetting}
        />
      );
    }

    const hasSheetContent = [
      'pl',
      'bs',
      'cf',
      'ppe',
      'financing',
      'wc',
    ].includes(activeTabId);
    if (hasSheetContent) {
      return (
        <FinancialDataGrid
          columns={columns}
          rows={displayRows}
          onCellChange={handleCellChange}
          readOnly={isUsingApiData}
        />
      );
    }
    const activeTab = Object.values(tabStructure)
      .flat()
      .find((t) => t.id === activeTabId);
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#6b7280',
        }}
      >
        <h3>{activeTab?.title}</h3>
        <p>このセクションは準備中です</p>
      </div>
    );
  }, [
    activeTabId,
    columns,
    displayRows,
    handleCellChange,
    tabStructure,
    rules,
    saveParameterSetting,
    effectiveUserAccounts,
    effectiveFinancialAccounts,
    isUsingApiData,
  ]);

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f9fafb',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', color: '#111827' }}>
            {companyName}
          </h2>
          <p style={{ margin: '5px 0 0', color: '#6b7280' }}>
            {modelName} ({modelVersion})
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <BackToTopButton />
            <span>
              決算月: {fiscalYearConfig.initialEndMonth}月
              {fiscalYearConfig.changes.length > 0 &&
                ` → ${fiscalYearConfig.changes[fiscalYearConfig.changes.length - 1].newEndMonth}月`}
            </span>
            <button
              onClick={() => setIsFiscalYearModalOpen(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              期中で決算期を変更
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <label style={{ fontSize: '12px', color: '#4b5563' }}>
              modelId
              <input
                type="number"
                value={modelId}
                onChange={(e) => setModelId(Number(e.target.value) || 0)}
                style={{
                  width: '70px',
                  marginLeft: '4px',
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </label>
            <label style={{ fontSize: '12px', color: '#4b5563' }}>
              scenarioId
              <input
                type="number"
                value={scenarioId}
                onChange={(e) => setScenarioId(Number(e.target.value) || 0)}
                style={{
                  width: '90px',
                  marginLeft: '4px',
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </label>
            <label style={{ fontSize: '12px', color: '#4b5563' }}>
              years
              <input
                type="number"
                value={projectionYears}
                onChange={(e) =>
                  setProjectionYears(Number(e.target.value) || 0)
                }
                style={{
                  width: '70px',
                  marginLeft: '4px',
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </label>
            <button
              onClick={handleStartCalculation}
              disabled={calculationLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: calculationLoading ? '#93c5fd' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: calculationLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {calculationLoading ? '計算中…' : '計算を実行'}
            </button>
            {isUsingApiData && (
              <button
                onClick={handleClearCalculation}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                結果をクリア
              </button>
            )}
          </div>
          {(calculationStatus !== 'IDLE' || calculationError) && (
            <div style={{ fontSize: '12px', color: '#4b5563' }}>
              ステータス: {calculationStatus}
              {calculationError && ` / エラー: ${calculationError}`}
            </div>
          )}
        </div>
      </div>

      {(isUsingDummyData || calculationStatus === 'FAILED') && (
        <div
          style={{
            margin: '0 0 20px 0',
            padding: '12px 16px',
            backgroundColor: '#fff7ed',
            border: '1px solid #f97316',
            borderRadius: '6px',
            color: '#9a3412',
          }}
        >
          {calculationStatus === 'FAILED' && calculationError
            ? `計算が失敗しました: ${calculationError}`
            : 'APIからデータを取得できなかったため、動作確認用のダミーデータを表示しています。'}
        </div>
      )}

      {isUsingApiData && calculationStatus === 'COMPLETED' && (
        <div
          style={{
            margin: '0 0 20px 0',
            padding: '12px 16px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #34d399',
            borderRadius: '6px',
            color: '#047857',
          }}
        >
          計算APIの結果を表示しています。
        </div>
      )}

      {isFiscalYearModalOpen && (
        <ChangeFiscalYearModal
          config={fiscalYearConfig}
          setConfig={setFiscalYearConfig}
          closeModal={() => setIsFiscalYearModalOpen(false)}
        />
      )}

      {/* Tab Container */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px 8px 0 0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          marginBottom: '1px',
        }}
      >
        <TabBar tabs={tabStructure.settings} group="settings" title="設定" />
        <TabBar tabs={tabStructure.deal} group="deal" title="ディール" />
        <TabBar tabs={tabStructure.sheet} group="sheet" title="シート" />
      </div>

      {/* Content */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {activeTabContent}
      </div>
    </div>
  );
};

export default FinancialModel;
