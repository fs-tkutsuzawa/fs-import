import React, {
  useState,
  useMemo,
  useCallback,
  Fragment,
  useEffect,
  useRef,
} from 'react';
import { useFinancialAccounts, Account } from '../hooks/useFinancialAccounts';
import { useUserAccounts } from '../hooks/useUserAccounts';
import FinancialStatementDisplay from '../components/FinancialStatementDisplay';
import {
  useCalculationRules,
  convertRuleToUIConfig,
} from '../hooks/useCalculationRules';
import {
  ParameterType,
  ParameterConfig as CalculationRuleConfig,
} from '../types/calculationRules';
import { BackToTopButton } from '../components';

// --- ヘルパー関数 ---
const createPredefinedMappings = (
  aggregatedAccountsData: Account[],
  importedData: any[]
) => {
  const mappings: Record<
    string,
    { type: string; targetAccountId: string | null }
  > = {};

  // user_accountsから取得したデータを使用してマッピング
  importedData.forEach((importedItem) => {
    // parent_ua_idがある場合（子科目の場合）
    if (importedItem.parent_ua_id) {
      // 親UAを探して、その親UAが所属するGAにchildOfとしてマッピング
      const parentUA = importedData.find(
        (p) => p.id === importedItem.parent_ua_id
      );
      if (parentUA) {
        // 親科目と同じマッピング先を探す（既にマッピング済みの場合）
        if (mappings[parentUA.id]) {
          mappings[importedItem.id] = {
            type: 'childOf',
            targetAccountId: mappings[parentUA.id].targetAccountId,
          };
        } else if (parentUA.parent_ga_id) {
          // 親のGA IDに基づいてマッピング
          const targetAgg = aggregatedAccountsData.find(
            (a: Account) =>
              a.ga_id === parentUA.parent_ga_id ||
              a.id === parentUA.parent_ga_id
          );
          if (targetAgg) {
            mappings[importedItem.id] = {
              type: 'childOf',
              targetAccountId: targetAgg.id,
            };
          }
        }
      }
    } else if (importedItem.parent_ga_id) {
      // parent_ua_idがなくparent_ga_idがある場合、GAに直接マッピング
      const targetAgg = aggregatedAccountsData.find(
        (a: Account) =>
          a.ga_id === importedItem.parent_ga_id ||
          a.id === importedItem.parent_ga_id
      );
      if (targetAgg) {
        mappings[importedItem.id] = {
          type: 'mapTo',
          targetAccountId: targetAgg.id,
        };
      }
    }
  });

  return mappings;
};

const calculateAccountsStructure = (
  mappings: Record<string, { type: string; targetAccountId: string | null }>,
  aggregatedAccountsData: Account[],
  importedData: any[]
) => {
  const nodeMap = new Map();

  // 1. Add all GAs and UAs to a map
  aggregatedAccountsData.forEach((acc) => {
    nodeMap.set(acc.id, { ...acc, children: [] });
  });
  importedData.forEach((ua) => {
    nodeMap.set(ua.id, {
      id: ua.id,
      account_name: ua.name || ua.ua_name,
      account_code: ua.code || ua.ua_code,
      isCalculated: ua.is_kpi || false,
      fs_type: ua.fs_type,
      children: [],
      parent_ga_id: ua.parent_ga_id,
      parent_ua_id: ua.parent_ua_id,
    });
  });

  // 2. Link children to parents
  nodeMap.forEach((node) => {
    // We only need to link UAs, as GAs are roots
    if (importedData.some((ua) => ua.id === node.id)) {
      let parentId = null;

      // Priority: explicit mapping
      const explicitMapping = mappings[node.id];
      if (
        explicitMapping &&
        explicitMapping.type === 'childOf' &&
        explicitMapping.targetAccountId
      ) {
        parentId = explicitMapping.targetAccountId;
      } else if (node.parent_ua_id) {
        // Then parent_ua_id. The raw ID from parent_ua_id must be prefixed to match the node key.
        parentId = `ua-${node.parent_ua_id}`;

        // Check if parent exists in nodeMap
        if (!nodeMap.has(parentId)) {
          console.warn(
            `Parent UA not found in nodeMap: ${parentId} for node ${node.id}`
          );
          // Fallback to parent_ga_id if parent UA doesn't exist
          if (node.parent_ga_id) {
            const parentGA = aggregatedAccountsData.find(
              (ga) =>
                ga.id === node.parent_ga_id ||
                ga.ga_code === node.parent_ga_id ||
                ga.account_code === node.parent_ga_id
            );
            if (parentGA) {
              parentId = parentGA.id;
              console.log(`Fallback to parent GA: ${parentId}`);
            }
          }
        }
      } else if (node.parent_ga_id) {
        // Then parent_ga_id
        const parentGA = aggregatedAccountsData.find(
          (ga) =>
            ga.id === node.parent_ga_id ||
            ga.ga_code === node.parent_ga_id ||
            ga.account_code === node.parent_ga_id
        );
        if (parentGA) {
          parentId = parentGA.id;
        }
      }

      if (parentId) {
        const parentNode = nodeMap.get(parentId);
        if (parentNode) {
          if (!parentNode.children.some((c: any) => c.id === node.id)) {
            parentNode.children.push(node);
          }
        } else {
          console.warn(
            `Parent node still not found in map: ${parentId} for node ${node.id}`
          );
        }
      } else {
        console.warn(
          `No parent found for node: ${node.id} (name: ${node.account_name})`
        );
      }
    }
  });

  const finalStructure: { [key: string]: any[] } = { PL: [], BS: [], CF: [] };
  const rootAccounts = aggregatedAccountsData.map((acc) => nodeMap.get(acc.id));

  ['PL', 'CF', 'BS'].forEach((fsType) => {
    finalStructure[fsType] = rootAccounts
      .filter(
        (acc: Account | undefined): acc is Account =>
          acc !== undefined && acc.fs_type === fsType
      )
      .sort((a: Account, b: Account) => a.order - b.order);
  });

  return finalStructure;
};

// --- 汎用コンポーネント ---
const Icon = ({ name, className }: { name: string; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={`w-5 h-5 ${className}`}
  >
    {name === 'pencil' && (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    )}
    {name === 'plus' && (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    )}
    {name === 'trash' && (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    )}
    {name === 'kpi' && (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
      />
    )}
  </svg>
);

const ConfirmationModal = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">確認</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
};

const AddAccountModal = ({
  isOpen,
  onClose,
  onAdd,
  parentName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
  parentName: string;
}) => {
  const [name, setName] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="text-lg font-semibold mb-2">科目を追加</h3>
        <p className="text-sm text-gray-600 mb-4">
          「{parentName}」の子科目として新しい科目を追加します。
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しい科目名"
          className="w-full p-2 border rounded-md mb-6"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              onAdd(name);
              onClose();
            }}
            disabled={!name}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
};

const MergeAccountModal = ({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) => {
  const [name, setName] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h3 className="text-lg font-semibold mb-2">統合科目名の設定</h3>
        <p className="text-sm text-gray-600 mb-4">
          選択した科目を統合し、新しい科目名を設定します。
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しい統合科目名"
          className="w-full p-2 border rounded-md mb-6"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={() => onConfirm(name)}
            disabled={!name}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300"
          >
            統合する
          </button>
        </div>
      </div>
    </div>
  );
};

const KpiSetupModal = ({
  isOpen,
  onClose,
  onComplete,
  accountName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void;
  accountName: string;
}) => {
  const [elements, setElements] = useState([
    { id: 1, type: 'variable', value: '' },
    { id: 2, type: 'variable', value: '' },
  ]);
  const [operators, setOperators] = useState(['×']);
  const addElement = () => {
    setElements((prev) => [
      ...prev,
      { id: Date.now(), type: 'variable', value: '' },
    ]);
    setOperators((prev) => [...prev, '×']);
  };
  const updateElement = (id: number, field: string, value: string) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, [field]: value } : el))
    );
  };
  const updateOperator = (index: number, value: string) => {
    setOperators((prev) => prev.map((op, i) => (i === index ? value : op)));
  };
  const handleComplete = () => {
    onComplete({ elements, operators });
    onClose();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
        <h3 className="text-lg font-semibold mb-2">KPI設定</h3>
        <p className="text-sm text-gray-600 mb-4">
          「{accountName}」を算出するためのKPIを設定します。
        </p>
        <div className="space-y-2 mb-4">
          {elements.map((el, index) => (
            <Fragment key={el.id}>
              {index > 0 && (
                <div className="flex justify-center">
                  <select
                    value={operators[index - 1]}
                    onChange={(e) => updateOperator(index - 1, e.target.value)}
                    className="font-bold text-xl border-gray-300 rounded-md shadow-sm"
                  >
                    <option value="×">×</option>
                    <option value="-">-</option>
                    <option value="+">+</option>
                    <option value="÷">÷</option>
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border">
                <div className="flex-grow">
                  <input
                    type={el.type === 'constant' ? 'number' : 'text'}
                    value={el.value}
                    onChange={(e) =>
                      updateElement(el.id, 'value', e.target.value)
                    }
                    placeholder={el.type === 'variable' ? '変数名' : '数値'}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => updateElement(el.id, 'type', 'variable')}
                    className={`px-3 py-1 text-xs rounded-full ${
                      el.type === 'variable'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    変数
                  </button>
                  <button
                    onClick={() => updateElement(el.id, 'type', 'constant')}
                    className={`px-3 py-1 text-xs rounded-full ${
                      el.type === 'constant'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    定数
                  </button>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        <button
          onClick={addElement}
          className="text-blue-600 hover:text-blue-800 text-sm mb-6"
        >
          + 要素を追加
        </button>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={handleComplete}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};

const AddNewAccountForParamModal = ({
  isOpen,
  onClose,
  onSave,
  accounts,
  aggregatedAccountsData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  accounts: any;
  aggregatedAccountsData: any;
}) => {
  const [accountName, setAccountName] = useState('');
  const [sheetType, setSheetType] = useState('PL'); // 'PL' or 'new'
  const [newSheetName, setNewSheetName] = useState('');
  const [parentAccountId, setParentAccountId] = useState(
    aggregatedAccountsData.find((a: Account) => a.fs_type === 'PL')?.id || ''
  );

  const plAggregatedAccounts = useMemo(
    () => aggregatedAccountsData.filter((a: Account) => a.fs_type === 'PL'),
    [aggregatedAccountsData]
  );

  if (!isOpen) return null;

  const handleSave = () => {
    if (!accountName || (sheetType === 'new' && !newSheetName)) return;
    const newAccountId = `new-${Date.now()}`;
    const newSheet = sheetType === 'new' ? newSheetName : 'PL';

    onSave({
      newAccountId,
      newSheet,
      accountDetails: {
        accountName,
        sheetType,
        newSheetName: sheetType === 'new' ? newSheetName : null,
        parentAccountId: sheetType === 'PL' ? parentAccountId : null,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">新しい科目を追加</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              新しい科目名
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="例：設備投資"
              className="mt-1 w-full p-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              追加先のシート
            </label>
            <select
              value={sheetType}
              onChange={(e) => setSheetType(e.target.value)}
              className="mt-1 w-full p-2 border rounded-md"
            >
              <option value="PL">PL (損益計算書)</option>
              <option value="new">新しいシートを作成</option>
            </select>
          </div>
          {sheetType === 'new' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                新しいシート名
              </label>
              <input
                type="text"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="例：PP&E"
                className="mt-1 w-full p-2 border rounded-md"
              />
            </div>
          )}
          {sheetType === 'PL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                親となる集約科目
              </label>
              <select
                value={parentAccountId}
                onChange={(e) => setParentAccountId(e.target.value)}
                className="mt-1 w-full p-2 border rounded-md"
              >
                {plAggregatedAccounts.map((acc: Account) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface ParameterConfig {
  flows?: any[];
  rate?: number;
  ratio?: number;
  targetAccountId?: string;
  operators?: string[];
}

const ParameterSettingModal = ({
  isOpen,
  onClose,
  onSave,
  onSetPeriodically,
  accountName,
  accounts,
  setAccounts,
  targetAccount,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (param: any, counterUpdates?: any[]) => void;
  onSetPeriodically: () => void;
  accountName: string;
  accounts: { [key: string]: Account[] };
  setAccounts: any;
  targetAccount: any;
}) => {
  const [step, setStep] = useState('selectType');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [config, setConfig] = useState<ParameterConfig>({});
  const [isAddingNewAccount, setIsAddingNewAccount] = useState<{
    isOpen: boolean;
    forFlowIndex: number | null;
    forNonFlow: boolean;
  }>({ isOpen: false, forFlowIndex: null, forNonFlow: false });

  useEffect(() => {
    if (isOpen) {
      const initialType = targetAccount?.parameter?.type;
      let initialConfig = JSON.parse(
        JSON.stringify(targetAccount?.parameter?.config || {})
      );

      if (initialType === 'prev_end_plus_change') {
        if (!initialConfig.flows || !Array.isArray(initialConfig.flows)) {
          initialConfig = {
            flows: initialConfig.flowAccountId
              ? [initialConfig]
              : [{ flowAccountId: '', sign: '+', counterAccountId: '' }],
          };
        }

        const findSheetByAccountId = (accs: any, accountId: string) => {
          for (const sheetName in accs) {
            if (sheetName === 'BS' || sheetName === 'CF') continue;
            const findInSheet = (items: any[]): boolean => {
              for (const item of items) {
                if (item.id === accountId) return true;
                if (item.children && findInSheet(item.children)) return true;
              }
              return false;
            };
            if (findInSheet(accs[sheetName])) return sheetName;
          }
          return null;
        };
        initialConfig.flows.forEach((flow: any) => {
          if (flow.flowAccountId && !flow.flowAccountSheet) {
            flow.flowAccountSheet = findSheetByAccountId(
              accounts,
              flow.flowAccountId
            );
          }
        });
      }

      setConfig(initialConfig);
      setSelectedType(initialType);

      const hasChildren =
        targetAccount?.children && targetAccount.children.length > 0;
      if (
        initialType &&
        initialType !== 'input' &&
        initialType !== 'sum_children' &&
        !(initialType === 'custom_calc' && !hasChildren)
      ) {
        setStep('configure');
      } else {
        setStep('selectType');
      }
    }
  }, [isOpen, targetAccount, accounts]);

  useEffect(() => {
    if (!isOpen) return; // Only run when modal is open
    const newFlows = config.flows?.map((flow: any) => {
      const newFlow = { ...flow };
      if (newFlow.flowAccountSheet === 'PL') {
        newFlow.counterAccountId = 'retained_earnings';
      } else if (newFlow.counterAccountId === 'retained_earnings') {
        newFlow.counterAccountId = '';
      }
      return newFlow;
    });

    if (newFlows && JSON.stringify(newFlows) !== JSON.stringify(config.flows)) {
      setConfig((prev) => ({ ...prev, flows: newFlows }));
    }
  }, [config.flows, isOpen, accounts]);

  const paramTypes = useMemo(() => {
    const hasChildren =
      targetAccount?.children && targetAccount.children.length > 0;

    const allTypes = [
      { id: 'input', name: 'インプット' },
      { id: 'growth_rate', name: '成長率' },
      { id: 'ratio', name: '割合' },
      { id: 'link', name: '連動' },
      { id: 'sum_children', name: '子科目合計' },
      { id: 'custom_calc', name: '個別計算' },
      { id: 'prev_end_plus_change', name: '前期末+変動' },
    ];

    if (hasChildren) {
      return allTypes.filter(
        (p) => p.id === 'sum_children' || p.id === 'custom_calc'
      );
    }
    // For leaf nodes, exclude 'sum_children'
    return allTypes.filter((p) => p.id !== 'sum_children');
  }, [targetAccount]);

  const allAccountsForSelect = useMemo(() => {
    const renderOptions = (
      items: any[],
      level = 0,
      sheetName: string
    ): any[] => {
      return items.flatMap((item) => [
        <option key={`${sheetName}-${item.id}`} value={item.id}>
          {'　'.repeat(level)}
          {item.account_name}
        </option>,
        ...(item.children
          ? renderOptions(item.children, level + 1, sheetName)
          : []),
      ]);
    };
    return Object.entries(accounts).map(([sheetName, sheetData]) => (
      <optgroup key={sheetName} label={sheetName}>
        {renderOptions(sheetData, 0, sheetName)}
      </optgroup>
    ));
  }, [accounts]);

  const flowAccountsForSelect = useMemo(() => {
    const renderOptions = (
      items: any[],
      level = 0,
      sheetName: string
    ): any[] => {
      return items.flatMap((item) => [
        <option
          key={`${sheetName}-${item.id}`}
          value={item.id}
          data-sheet={sheetName}
        >
          {'　'.repeat(level)}
          {item.account_name}
        </option>,
        ...(item.children
          ? renderOptions(item.children, level + 1, sheetName)
          : []),
      ]);
    };
    return Object.entries(accounts)
      .filter(([sheetName]) => sheetName !== 'BS' && sheetName !== 'CF')
      .map(([sheetName, sheetData]) => (
        <optgroup key={sheetName} label={sheetName}>
          {renderOptions(sheetData, 0, sheetName)}
        </optgroup>
      ));
  }, [accounts]);

  const getBsAccountsForCounterSelectJsx = useCallback(
    (flow: any) => {
      const renderOptions = (items: any[], level = 0): any[] => {
        return items.flatMap((item) => {
          const hasChildren = item.children && item.children.length > 0;
          const isDisabled =
            hasChildren ||
            (flow?.flowAccountSheet !== 'PL' &&
              item.id === 'retained_earnings');
          const childrenOptions = item.children
            ? renderOptions(item.children, level + 1)
            : [];
          return [
            <option key={item.id} value={item.id} disabled={isDisabled}>
              {'　'.repeat(level)}
              {item.account_name}
            </option>,
            ...childrenOptions,
          ];
        });
      };
      return renderOptions(accounts.BS || []);
    },
    [accounts.BS]
  );

  const handleTypeSelect = (type: string) => {
    const hasChildren =
      targetAccount?.children && targetAccount.children.length > 0;
    setSelectedType(type);

    if (
      type === 'input' ||
      type === 'sum_children' ||
      (type === 'custom_calc' && !hasChildren)
    ) {
      onSave({ type, config: {} });
      onClose();
    } else {
      const currentConfig =
        targetAccount?.parameter?.type === type
          ? targetAccount.parameter.config
          : {};

      let initialConfig = currentConfig;
      if (
        type === 'prev_end_plus_change' &&
        (!currentConfig.flows || currentConfig.flows.length === 0)
      ) {
        initialConfig = {
          flows: [{ flowAccountId: '', sign: '+', counterAccountId: '' }],
        };
      } else if (type === 'custom_calc' && hasChildren) {
        initialConfig = {
          operators:
            currentConfig.operators ||
            targetAccount.children.slice(1).map(() => '+'),
        };
      }
      setConfig(initialConfig);
      setStep('configure');
    }
  };

  const handleConfigChange = (index: number, key: string, value: string) => {
    const newFlows = [...(config.flows || [])];
    newFlows[index] = { ...newFlows[index], [key]: value };
    setConfig((prev) => ({ ...prev, flows: newFlows }));
  };

  const handleNonFlowConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleFlowAccountSelectChange = (
    index: number,
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    const newFlows = [...(config.flows || [])];
    if (!value) {
      newFlows[index] = {
        ...newFlows[index],
        flowAccountId: '',
        flowAccountSheet: null,
      };
    } else {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const sheet =
        selectedOption.closest('optgroup')?.label ||
        selectedOption.dataset.sheet;
      newFlows[index] = {
        ...newFlows[index],
        flowAccountId: value,
        flowAccountSheet: sheet,
      };
    }
    setConfig((prev) => ({ ...prev, flows: newFlows }));
  };

  const addFlow = () => {
    const newFlows = [
      ...(config.flows || []),
      { flowAccountId: '', sign: '+', counterAccountId: '' },
    ];
    setConfig((prev) => ({ ...prev, flows: newFlows }));
  };

  const removeFlow = (index: number) => {
    const newFlows = (config.flows || []).filter((_, i) => i !== index);
    setConfig((prev) => ({ ...prev, flows: newFlows }));
  };

  const handleSave = () => {
    const counterAccountUpdates: any[] = [];
    if (selectedType === 'prev_end_plus_change' && config.flows) {
      config.flows.forEach((flow) => {
        const counterId = flow.counterAccountId;
        if (counterId && counterId !== 'cash_and_deposits') {
          const newFlowForCounter = {
            flowAccountId: targetAccount.id,
            sign: flow.sign === '+' ? '-' : '+',
          };
          counterAccountUpdates.push({
            accountId: counterId,
            newFlow: newFlowForCounter,
          });
        }
      });
    }
    onSave({ type: selectedType, config }, counterAccountUpdates);
    onClose();
  };

  const handleAddNewAccount = ({
    newAccountId,
    newSheet,
    accountDetails,
  }: any) => {
    setAccounts((prev: any) => {
      const newAccounts = JSON.parse(JSON.stringify(prev));
      const newAccount = {
        id: newAccountId,
        account_name: accountDetails.accountName,
        isCalculated: false,
        children: [],
      };

      if (accountDetails.sheetType === 'new') {
        newAccounts[accountDetails.newSheetName] = [newAccount];
      } else {
        // PL
        const handleUpdate = (items: any[]): boolean => {
          for (const item of items) {
            if (item.id === accountDetails.parentAccountId) {
              item.children = [...(item.children || []), newAccount];
              return true;
            }
            if (item.children && handleUpdate(item.children)) return true;
          }
          return false;
        };
        handleUpdate(newAccounts.PL);
      }
      return newAccounts;
    });

    if (isAddingNewAccount.forFlowIndex !== null) {
      const index = isAddingNewAccount.forFlowIndex;
      const newFlows = [...(config.flows || [])];
      newFlows[index] = {
        ...newFlows[index],
        flowAccountId: newAccountId,
        flowAccountSheet: newSheet,
      };
      setConfig((prev) => ({ ...prev, flows: newFlows }));
    } else if (isAddingNewAccount.forNonFlow) {
      setConfig((prev) => ({ ...prev, targetAccountId: newAccountId }));
    }
  };

  const renderConfigForm = () => {
    switch (selectedType) {
      case 'growth_rate':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              成長率 (%)
            </label>
            <input
              type="number"
              value={config.rate || ''}
              onChange={(e) =>
                handleNonFlowConfigChange('rate', e.target.value)
              }
              className="mt-1 w-full p-2 border rounded-md"
              placeholder="例: 5"
            />
          </div>
        );
      case 'ratio':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                参照科目
              </label>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={config.targetAccountId || ''}
                  onChange={(e) =>
                    handleNonFlowConfigChange('targetAccountId', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">科目を選択...</option>
                  {allAccountsForSelect}
                </select>
                <span className="text-gray-500">or</span>
                <button
                  onClick={() =>
                    setIsAddingNewAccount({
                      isOpen: true,
                      forFlowIndex: null,
                      forNonFlow: true,
                    })
                  }
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm whitespace-nowrap"
                >
                  新規追加
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                割合 (%)
              </label>
              <input
                type="number"
                value={config.ratio || ''}
                onChange={(e) =>
                  handleNonFlowConfigChange('ratio', e.target.value)
                }
                className="mt-1 w-full p-2 border rounded-md"
                placeholder="例: 50"
              />
            </div>
          </div>
        );
      case 'link':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              参照科目
            </label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={config.targetAccountId || ''}
                onChange={(e) =>
                  handleNonFlowConfigChange('targetAccountId', e.target.value)
                }
                className="w-full p-2 border rounded-md"
              >
                <option value="">科目を選択...</option>
                {allAccountsForSelect}
              </select>
              <span className="text-gray-500">or</span>
              <button
                onClick={() =>
                  setIsAddingNewAccount({
                    isOpen: true,
                    forFlowIndex: null,
                    forNonFlow: true,
                  })
                }
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm whitespace-nowrap"
              >
                新規追加
              </button>
            </div>
          </div>
        );
      case 'custom_calc': {
        const handleOperatorChange = (index: number, value: string) => {
          const newOperators = [...(config.operators || [])];
          newOperators[index] = value;
          setConfig((prev) => ({ ...prev, operators: newOperators }));
        };

        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">
              子科目の計算式を設定します。計算は算術演算の優先順位に従います。
            </p>
            {targetAccount.children.map((child: any, index: number) => (
              <div key={child.id} className="flex items-center gap-3">
                <div className="w-16 flex justify-center">
                  {index > 0 ? (
                    <select
                      value={
                        (config.operators && config.operators[index - 1]) || '+'
                      }
                      onChange={(e) =>
                        handleOperatorChange(index - 1, e.target.value)
                      }
                      className="p-2 border rounded-md text-lg font-mono"
                    >
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="×">×</option>
                      <option value="÷">÷</option>
                    </select>
                  ) : (
                    <span></span>
                  )}
                </div>
                <span className="flex-grow p-2 bg-gray-100 rounded-md truncate">
                  {child.account_name}
                </span>
              </div>
            ))}
          </div>
        );
      }
      case 'prev_end_plus_change':
        return (
          <div className="space-y-4">
            <div className="space-y-6 max-h-64 overflow-y-auto pr-2">
              {config.flows?.map((flow, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-md relative space-y-4 bg-gray-50"
                >
                  {config.flows && config.flows.length > 1 && (
                    <button
                      onClick={() => removeFlow(index)}
                      className="absolute top-1 right-2 text-gray-400 hover:text-red-500 font-bold text-xl"
                    >
                      &times;
                    </button>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      影響を与えるフロー科目
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={flow.flowAccountId || ''}
                        onChange={(e) =>
                          handleFlowAccountSelectChange(index, e)
                        }
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="">科目を選択...</option>
                        {flowAccountsForSelect}
                      </select>
                      <span className="text-gray-500">or</span>
                      <button
                        onClick={() =>
                          setIsAddingNewAccount({
                            isOpen: true,
                            forFlowIndex: index,
                            forNonFlow: false,
                          })
                        }
                        className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm whitespace-nowrap"
                      >
                        新規追加
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      増減
                    </label>
                    <select
                      value={flow.sign || '+'}
                      onChange={(e) =>
                        handleConfigChange(index, 'sign', e.target.value)
                      }
                      className="mt-1 w-full p-2 border rounded-md"
                    >
                      <option value="+">増加 (+)</option>
                      <option value="-">減少 (-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      相手科目
                    </label>
                    <select
                      value={flow.counterAccountId || ''}
                      onChange={(e) =>
                        handleConfigChange(
                          index,
                          'counterAccountId',
                          e.target.value
                        )
                      }
                      className="mt-1 w-full p-2 border rounded-md bg-white disabled:bg-gray-200"
                      disabled={flow.flowAccountSheet === 'PL'}
                    >
                      <option value="">BS科目を選択...</option>
                      {getBsAccountsForCounterSelectJsx(flow)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addFlow}
              className="w-full px-4 py-2 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
            >
              + フロー科目を追加
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const getTypeName = (id: string) =>
    paramTypes.find((p) => p.id === id)?.name || id;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <AddNewAccountForParamModal
          isOpen={isAddingNewAccount.isOpen}
          onClose={() =>
            setIsAddingNewAccount({
              isOpen: false,
              forFlowIndex: null,
              forNonFlow: false,
            })
          }
          onSave={handleAddNewAccount}
          accounts={accounts}
          aggregatedAccountsData={targetAccount?.aggregatedAccountsData || []}
        />
        <h3 className="text-lg font-semibold mb-2">パラメータ設定</h3>
        <p className="text-sm text-gray-600 mb-6">
          「{accountName}」の計算方法を
          {step === 'selectType'
            ? '選択してください。'
            : `設定してください。（${getTypeName(selectedType || '')}）`}
        </p>

        {step === 'selectType' ? (
          <div className="grid grid-cols-2 gap-4">
            {paramTypes.map((param) => (
              <button
                key={param.id}
                onClick={() => handleTypeSelect(param.id)}
                className="p-4 border rounded-lg text-center font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  param.id === 'prev_end_plus_change' &&
                  targetAccount?.fs_type !== 'BS'
                }
              >
                {param.name}
                {param.id === 'prev_end_plus_change' && (
                  <span className="block text-xs text-gray-400">
                    (BS科目のみ)
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="my-4">{renderConfigForm()}</div>
        )}

        <div className="flex justify-between items-center mt-6">
          {step === 'selectType' ? (
            <button
              onClick={onSetPeriodically}
              className="px-4 py-2 text-white bg-gray-600 rounded-md hover:bg-gray-700"
            >
              期間ごとに設定
            </button>
          ) : (
            <button
              onClick={() => setStep('selectType')}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              戻る
            </button>
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

const PeriodicParameterModal = ({
  isOpen,
  onClose,
  onSave,
  accountName,
  initialSettings,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
  accountName: string;
  initialSettings?: any;
}) => {
  const periods = useMemo(
    () => [
      '2026年3月期',
      '2027年3月期',
      '2028年3月期',
      '2029年3月期',
      '2030年3月期',
    ],
    []
  );
  const paramTypes = useMemo(
    () => [
      { id: 'input', name: 'インプット' },
      { id: 'growth_rate', name: '成長率' },
      { id: 'ratio', name: '割合' },
      { id: 'link', name: '連動' },
      { id: 'custom_calc', name: '個別計算' },
      { id: 'prev_end_plus_change', name: '前期末+変動' },
    ],
    []
  );

  const [settings, setSettings] = useState(() => {
    if (initialSettings) return initialSettings;
    return periods.map((p) => ({ period: p, type: 'input' }));
  });

  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const getParameterTypeName = useCallback(
    (type: string) => paramTypes.find((p) => p.id === type)?.name || '未設定',
    [paramTypes]
  );

  const handleMouseDown = (index: number) => {
    setIsDragging(true);
    setSelectionStart(index);
    setSelectionEnd(index);
  };

  const handleMouseEnter = (index: number) => {
    if (isDragging) {
      setSelectionEnd(index);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isOpen, handleMouseUp]);

  const handleApplyParameter = (type: string) => {
    if (selectionStart === null || selectionEnd === null) return;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    setSettings((currentSettings: any) =>
      currentSettings.map((setting: any, index: number) =>
        index >= start && index <= end ? { ...setting, type } : setting
      )
    );
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  if (!isOpen) return null;

  const startIdx =
    selectionStart !== null && selectionEnd !== null
      ? Math.min(selectionStart, selectionEnd)
      : -1;
  const endIdx =
    selectionStart !== null && selectionEnd !== null
      ? Math.max(selectionStart, selectionEnd)
      : -1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl"
        onMouseUp={handleMouseUp}
      >
        <h3 className="text-lg font-semibold mb-2">期間別パラメータ設定</h3>
        <p className="text-sm text-gray-600 mb-6">
          「{accountName}
          」の期間ごとの計算方法を設定します。期間をドラッグで選択し、下のボタンでパラメータを適用してください。
        </p>

        <div className="flex justify-between items-stretch mb-6 select-none cursor-pointer">
          {settings.map(({ period, type }: any, index: number) => {
            const isSelected = index >= startIdx && index <= endIdx;
            return (
              <div
                key={period}
                onMouseDown={() => handleMouseDown(index)}
                onMouseEnter={() => handleMouseEnter(index)}
                className={`flex-1 text-center border-y-2 border-transparent py-2 ${
                  isSelected ? 'bg-blue-200 border-blue-400' : 'bg-gray-100'
                }`}
              >
                <div className="text-sm font-bold text-gray-800">{period}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {getParameterTypeName(type)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {paramTypes.map((param) => (
            <button
              key={param.id}
              onClick={() => handleApplyParameter(param.id)}
              disabled={selectionStart === null}
              className="p-3 border rounded-lg text-center font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {param.name}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave(settings)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ビュー別コンポーネント ---
const MappingCompletionScreen = ({
  accounts,
  onEditClick,
  onProceedToParamsClick,
}: {
  accounts: any;
  onEditClick: () => void;
  onProceedToParamsClick: () => void;
}) => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-end mb-4">
        <BackToTopButton />
      </div>
      <header className="mb-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            ></path>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          マッピングが完了しました
        </h1>
        <p className="text-gray-600 mt-2 mb-6">
          作成された勘定科目体系を確認し、次のステップに進んでください。
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-2">
          <button
            onClick={onProceedToParamsClick}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors text-lg"
          >
            パラメータ設定に進む
          </button>
          <button
            onClick={onEditClick}
            className="w-full sm:w-auto px-8 py-3 bg-white text-gray-700 font-semibold rounded-lg border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors text-lg"
          >
            科目・KPIの編集を行う
          </button>
        </div>
        <p className="text-sm text-gray-500">科目・KPIはいつでも編集可能です</p>
      </header>
      <FinancialStatementDisplay
        finalizedAccounts={accounts}
        showBackButton={false}
        showConfirmButton={false}
        title=""
        description=""
      />
    </div>
  );
};

const aggregatedAccountsData: Account[] = [];

const AccountItem = ({
  item,
  level,
  editingItem,
  setEditingItem,
  handleRename,
  setAddModal,
  setKpiModal,
  setConfirm,
  isMergeMode,
  selectedToMerge,
  handleToggleMergeSelection,
}: any) => {
  const isAggregatedAccount = useMemo(
    () => aggregatedAccountsData.some((acc: Account) => acc.id === item.id),
    [item.id]
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingItem.id === item.id && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingItem, item.id]);

  return (
    <Fragment>
      <div
        className={`group flex items-center justify-between p-2.5 border-b border-gray-200 hover:bg-gray-50 ${
          item.isCalculated ? 'bg-blue-50' : 'bg-white'
        }`}
        style={{ paddingLeft: `${1 + level * 1.5}rem` }}
      >
        <div className="flex-grow flex items-center gap-3 overflow-hidden">
          {isMergeMode && level > 0 && !item.isKpi && (
            <input
              type="checkbox"
              className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={selectedToMerge.includes(item.id)}
              onChange={() => handleToggleMergeSelection(item.id)}
            />
          )}
          {editingItem.id === item.id ? (
            <input
              ref={inputRef}
              type="text"
              value={editingItem.name}
              onChange={(e) =>
                setEditingItem((prev: any) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              onBlur={() => handleRename(item.id, editingItem.name)}
              onKeyDown={(e) =>
                e.key === 'Enter' && handleRename(item.id, editingItem.name)
              }
              className="p-0 border-b-2 border-blue-500 focus:outline-none font-medium text-gray-800 w-full bg-transparent"
            />
          ) : (
            <span
              className={`font-medium truncate ${
                item.isKpi
                  ? 'text-gray-600 font-mono'
                  : item.isCalculated
                    ? 'text-blue-800'
                    : 'text-gray-800'
              }`}
            >
              {item.account_name}
            </span>
          )}
          {item.isKpi && (
            <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex-shrink-0">
              KPI
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {!item.isCalculated && (
            <button
              onClick={() =>
                setEditingItem({ id: item.id, name: item.account_name })
              }
              className="p-1 text-gray-500 hover:text-blue-600"
            >
              <Icon name="pencil" />
            </button>
          )}

          {!item.isCalculated && !item.isKpi && isAggregatedAccount && (
            <button
              onClick={() =>
                setAddModal({
                  isOpen: true,
                  parentId: item.id,
                  parentName: item.account_name,
                })
              }
              className="flex items-center gap-1 text-sm text-gray-600 bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md"
            >
              <Icon name="plus" className="w-4 h-4" /> 科目追加
            </button>
          )}
          {!item.isCalculated && (!isAggregatedAccount || item.isKpi) && (
            <>
              <button
                onClick={() =>
                  setKpiModal({
                    isOpen: true,
                    targetId: item.id,
                    targetName: item.account_name,
                  })
                }
                className="flex items-center gap-1 text-sm text-gray-600 bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md"
              >
                <Icon name="kpi" className="w-4 h-4" /> KPI
              </button>
              <button
                onClick={() => setConfirm({ isOpen: true, id: item.id })}
                className="p-1 text-gray-500 hover:text-red-600"
              >
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
      </div>
      {item.children &&
        item.children.map((child: any) => (
          <AccountItem
            key={child.id}
            item={child}
            level={level + 1}
            editingItem={editingItem}
            setEditingItem={setEditingItem}
            handleRename={handleRename}
            setAddModal={setAddModal}
            setKpiModal={setKpiModal}
            setConfirm={setConfirm}
            isMergeMode={isMergeMode}
            selectedToMerge={selectedToMerge}
            handleToggleMergeSelection={handleToggleMergeSelection}
          />
        ))}
    </Fragment>
  );
};

const AccountKpiSetupScreen = ({
  accounts,
  setAccounts,
  onSave,
}: {
  accounts: any;
  setAccounts: any;
  onSave: (accounts: any) => void;
}) => {
  const [activeTab, setActiveTab] = useState('PL');
  const [editingItem, setEditingItem] = useState<{
    id: string | null;
    name: string;
  }>({ id: null, name: '' });
  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    parentId: string | null;
    parentName: string;
  }>({ isOpen: false, parentId: null, parentName: '' });
  const [kpiModal, setKpiModal] = useState<{
    isOpen: boolean;
    targetId: string | null;
    targetName: string;
  }>({ isOpen: false, targetId: null, targetName: '' });
  const [confirm, setConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
  }>({ isOpen: false, id: null });
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedToMerge, setSelectedToMerge] = useState<string[]>([]);
  const [mergeModal, setMergeModal] = useState({ isOpen: false });
  const fsTypes = useMemo(() => {
    const defaultTypes: { [key: string]: string } = {
      PL: '損益計算書 (PL)',
      BS: '貸借対照表 (BS)',
      CF: 'キャッシュフロー計算書 (CF)',
    };
    const customTypes = Object.keys(accounts)
      .filter((key) => !(key in defaultTypes))
      .reduce<{ [key: string]: string }>((acc, key) => {
        acc[key] = key;
        return acc;
      }, {});
    return { ...defaultTypes, ...customTypes };
  }, [accounts]);

  const findParentOfNode = (nodes: any[], childId: string): any => {
    for (const node of nodes) {
      if (
        node.children &&
        node.children.some((child: any) => child.id === childId)
      ) {
        return node;
      }
      if (node.children) {
        const foundParent = findParentOfNode(node.children, childId);
        if (foundParent) return foundParent;
      }
    }
    return null;
  };

  const handleUpdate = (
    obj: any,
    id: string,
    updateFn: (item: any) => any
  ): any => {
    if (Array.isArray(obj))
      return obj
        .map((item) => handleUpdate(item, id, updateFn))
        .filter(Boolean);
    if (obj.id === id) return updateFn(obj);
    if (obj.children)
      return {
        ...obj,
        children: obj.children
          .map((child: any) => handleUpdate(child, id, updateFn))
          .filter(Boolean),
      };
    return obj;
  };

  const updateAccounts = (id: string, updateFn: (item: any) => any) => {
    setAccounts((prev: any) => {
      const newAccounts = JSON.parse(JSON.stringify(prev));
      Object.keys(newAccounts).forEach((key) => {
        newAccounts[key] = handleUpdate(newAccounts[key], id, updateFn);
      });
      return newAccounts;
    });
  };

  const handleRename = (id: string, newName: string) => {
    if (!newName.trim()) {
      setEditingItem({ id: null, name: '' });
      return;
    }
    updateAccounts(id, (item) => ({ ...item, account_name: newName }));
    setEditingItem({ id: null, name: '' });
  };

  const handleAdd = (name: string) => {
    const newAccount = {
      id: `new-${Date.now()}`,
      account_name: name,
      isCalculated: false,
      children: [],
    };
    updateAccounts(addModal.parentId!, (item) => ({
      ...item,
      children: [...(item.children || []), newAccount],
    }));
  };

  const kpiToString = (kpi: any) =>
    kpi.elements
      .map((el: any) => el.value || (el.type === 'variable' ? '[変数]' : '0'))
      .reduce(
        (prev: string, curr: string, i: number) =>
          i === 0 ? curr : `${prev} ${kpi.operators[i - 1]} ${curr}`,
        ''
      );

  const handleKpiAdd = (kpiData: any) => {
    const newKpi = {
      id: `kpi-${Date.now()}`,
      account_name: kpiToString(kpiData),
      isKpi: true,
      isCalculated: false,
      kpiDefinition: kpiData,
      children: [],
    };
    updateAccounts(kpiModal.targetId!, (item) => ({
      ...item,
      children: [...(item.children || []), newKpi],
    }));
  };

  const handleDelete = () => {
    updateAccounts(confirm.id!, (item) => null);
    setConfirm({ isOpen: false, id: null });
  };

  const toggleMergeMode = () => {
    setIsMergeMode(!isMergeMode);
    setSelectedToMerge([]);
  };

  const handleToggleMergeSelection = (itemId: string) => {
    setSelectedToMerge((currentSelection) => {
      const isSelected = currentSelection.includes(itemId);
      if (isSelected) {
        return currentSelection.filter((id) => id !== itemId);
      } else {
        if (currentSelection.length === 0) {
          return [itemId];
        }
        const parentOfFirst = findParentOfNode(
          accounts[activeTab],
          currentSelection[0]
        );
        const parentOfCurrent = findParentOfNode(accounts[activeTab], itemId);
        if (
          parentOfFirst &&
          parentOfCurrent &&
          parentOfFirst.id === parentOfCurrent.id
        ) {
          return [...currentSelection, itemId];
        }
        return currentSelection;
      }
    });
  };

  const handleConfirmMerge = (newName: string) => {
    if (!newName.trim() || selectedToMerge.length < 2) return;
    const parent = findParentOfNode(accounts[activeTab], selectedToMerge[0]);
    if (!parent) return;

    let combinedChildren: any[] = [];
    parent.children.forEach((child: any) => {
      if (selectedToMerge.includes(child.id) && child.children) {
        combinedChildren = [...combinedChildren, ...child.children];
      }
    });

    const newMergedAccount = {
      id: `merged-${Date.now()}`,
      account_name: newName,
      isCalculated: false,
      children: combinedChildren,
    };

    const newChildren: any[] = [];
    let mergedAccountInserted = false;
    parent.children.forEach((child: any) => {
      if (selectedToMerge.includes(child.id)) {
        if (!mergedAccountInserted) {
          newChildren.push(newMergedAccount);
          mergedAccountInserted = true;
        }
      } else {
        newChildren.push(child);
      }
    });

    updateAccounts(parent.id, (p) => ({ ...p, children: newChildren }));

    setMergeModal({ isOpen: false });
    setIsMergeMode(false);
    setSelectedToMerge([]);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ConfirmationModal
        isOpen={confirm.isOpen}
        message="この項目を削除しますか？"
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ isOpen: false, id: null })}
      />
      <AddAccountModal
        isOpen={addModal.isOpen}
        onClose={() =>
          setAddModal({ isOpen: false, parentId: null, parentName: '' })
        }
        onAdd={handleAdd}
        parentName={addModal.parentName}
      />
      <KpiSetupModal
        isOpen={kpiModal.isOpen}
        onClose={() =>
          setKpiModal({ isOpen: false, targetId: null, targetName: '' })
        }
        onComplete={handleKpiAdd}
        accountName={kpiModal.targetName}
      />
      <MergeAccountModal
        isOpen={mergeModal.isOpen}
        onClose={() => setMergeModal({ isOpen: false })}
        onConfirm={handleConfirmMerge}
      />

      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">科目・KPI設定</h1>
          <p className="text-gray-600 mt-2">
            勘定科目体系を編集し、KPIを設定します。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BackToTopButton />
          {isMergeMode && (
            <button
              onClick={() => setMergeModal({ isOpen: true })}
              disabled={selectedToMerge.length < 2}
              className="px-4 py-2 mr-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              統合科目の設定
            </button>
          )}
          <button
            onClick={toggleMergeMode}
            className={`px-4 py-2 mr-2 font-semibold rounded-md border ${
              isMergeMode
                ? 'bg-gray-200 text-gray-800 border-gray-400'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {isMergeMode ? 'キャンセル' : '科目の統合'}
          </button>
          <button
            onClick={() => onSave(accounts)}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </header>
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {Object.entries(fsTypes).map(([key, name]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-shrink-0 px-6 py-3 font-semibold text-sm focus:outline-none transition-colors ${
                activeTab === key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div>
          {accounts[activeTab] &&
            accounts[activeTab].map((item: any) => (
              <AccountItem
                key={item.id}
                item={item}
                level={0}
                editingItem={editingItem}
                setEditingItem={setEditingItem}
                handleRename={handleRename}
                setAddModal={setAddModal}
                setKpiModal={setKpiModal}
                setConfirm={setConfirm}
                isMergeMode={isMergeMode}
                selectedToMerge={selectedToMerge}
                handleToggleMergeSelection={handleToggleMergeSelection}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

const ParameterSetupScreen = ({
  accounts,
  setAccounts,
  onBack,
  scenarioId = '1', // Default scenario ID - should be passed from parent in production
}: {
  accounts: { [key: string]: Account[] };
  setAccounts: any;
  onBack: () => void;
  scenarioId?: string | number;
}) => {
  const [activeTab, setActiveTab] = useState('PL');
  const [paramModal, setParamModal] = useState<{
    isOpen: boolean;
    targetId: string | null;
    targetName: string;
    targetAccount: any;
  }>({ isOpen: false, targetId: null, targetName: '', targetAccount: null });
  const [periodicModal, setPeriodicModal] = useState<{
    isOpen: boolean;
    targetId: string | null;
    targetName: string;
    initialSettings: any;
  }>({ isOpen: false, targetId: null, targetName: '', initialSettings: null });
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  // Use calculation rules hook
  const {
    rules,
    saveParameterSetting,
    loadRuleForAccount,
    error: apiError,
  } = useCalculationRules({ scenarioId });

  const handleSaveParameter = async (
    param: any,
    counterAccountUpdates: any[] = []
  ) => {
    // Save to API
    if (paramModal.targetId) {
      setSavingStatus('保存中...');
      try {
        await saveParameterSetting(
          paramModal.targetId,
          param.type as ParameterType,
          param.config as CalculationRuleConfig
        );

        // Handle counter account updates for BALANCE_AND_CHANGE type
        if (counterAccountUpdates.length > 0) {
          for (const update of counterAccountUpdates) {
            try {
              // Load existing rule for counter account
              const existingRule = await loadRuleForAccount(update.accountId);
              const existingConfig = existingRule
                ? convertRuleToUIConfig(existingRule)
                : null;

              const flows =
                existingConfig?.config && 'flows' in existingConfig.config
                  ? existingConfig.config.flows
                  : [];

              // Add or update the flow
              const existingFlowIndex = flows.findIndex(
                (f: any) => f.flowAccountId === update.newFlow.flowAccountId
              );

              if (existingFlowIndex >= 0) {
                flows[existingFlowIndex] = update.newFlow;
              } else {
                flows.push(update.newFlow);
              }

              // Save the updated counter account rule
              await saveParameterSetting(
                update.accountId,
                'prev_end_plus_change' as any,
                { flows } as CalculationRuleConfig
              );
            } catch (err) {}
          }
        }

        setSavingStatus('保存完了');
        setTimeout(() => setSavingStatus(null), 2000);
      } catch (error) {
        setSavingStatus('保存失敗');
        setTimeout(() => setSavingStatus(null), 3000);
      }
    }

    // Update local state for UI
    setAccounts((prevAccounts: any) => {
      const newAccounts = JSON.parse(JSON.stringify(prevAccounts));

      const findAndGetAccount = (items: any[], id: string): any => {
        for (const item of items) {
          if (item.id === id) return item;
          if (item.children) {
            const found = findAndGetAccount(item.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const findAndUpdateAccount = (
        items: any[],
        id: string,
        updateFn: (item: any) => any
      ): any[] => {
        return items.map((item) => {
          if (item.id === id) return updateFn(item);
          if (item.children)
            return {
              ...item,
              children: findAndUpdateAccount(item.children, id, updateFn),
            };
          return item;
        });
      };

      const updatesForCounters: any[] = [];
      if (counterAccountUpdates.length > 0) {
        counterAccountUpdates.forEach((updateInfo) => {
          let counterAccount = null;
          for (const sheet of Object.values(newAccounts)) {
            counterAccount = findAndGetAccount(
              sheet as any[],
              updateInfo.accountId
            );
            if (counterAccount) break;
          }

          if (counterAccount) {
            let currentParam = counterAccount.parameter || {
              type: 'input',
              config: {},
            };
            if (currentParam.type !== 'prev_end_plus_change') {
              currentParam = {
                type: 'prev_end_plus_change',
                config: { flows: [] },
              };
            } else {
              currentParam.config.flows = currentParam.config.flows || [];
            }

            const newFlowForCounter = { ...updateInfo.newFlow };

            const existingFlowIndex = currentParam.config.flows.findIndex(
              (f: any) => f.flowAccountId === newFlowForCounter.flowAccountId
            );
            if (existingFlowIndex > -1) {
              currentParam.config.flows[existingFlowIndex] = newFlowForCounter;
            } else {
              currentParam.config.flows.push(newFlowForCounter);
            }
            updatesForCounters.push({
              accountId: updateInfo.accountId,
              parameter: currentParam,
            });
          }
        });
      }

      updatesForCounters.forEach((update: any) => {
        Object.keys(newAccounts).forEach((key) => {
          newAccounts[key] = findAndUpdateAccount(
            newAccounts[key],
            update.accountId,
            (item) => ({ ...item, parameter: update.parameter })
          );
        });
      });

      Object.keys(newAccounts).forEach((key) => {
        newAccounts[key] = findAndUpdateAccount(
          newAccounts[key],
          paramModal.targetId!,
          (item) => ({ ...item, parameter: param })
        );
      });

      return newAccounts;
    });
  };

  const handleOpenPeriodicModal = () => {
    const { targetId, targetName, targetAccount } = paramModal;
    const initialSettings =
      targetAccount &&
      targetAccount.parameter &&
      targetAccount.parameter.type === 'periodic'
        ? targetAccount.parameter.config
        : null;
    setPeriodicModal({ isOpen: true, targetId, targetName, initialSettings });
    setParamModal({
      isOpen: false,
      targetId: null,
      targetName: '',
      targetAccount: null,
    });
  };

  const handleSavePeriodicSettings = (settings: any) => {
    const param = { type: 'periodic', config: settings };
    setAccounts((prevAccounts: any) => {
      const newAccounts = JSON.parse(JSON.stringify(prevAccounts));
      const findAndUpdateAccount = (
        items: any[],
        id: string,
        updateFn: (item: any) => any
      ): any[] => {
        return items.map((item) => {
          if (item.id === id) return updateFn(item);
          if (item.children)
            return {
              ...item,
              children: findAndUpdateAccount(item.children, id, updateFn),
            };
          return item;
        });
      };
      Object.keys(newAccounts).forEach((key) => {
        newAccounts[key] = findAndUpdateAccount(
          newAccounts[key],
          periodicModal.targetId!,
          (item) => ({ ...item, parameter: param })
        );
      });
      return newAccounts;
    });
    setPeriodicModal({
      isOpen: false,
      targetId: null,
      targetName: '',
      initialSettings: null,
    });
  };

  const getParameterTypeName = (type: string) => {
    const names: { [key: string]: string } = {
      input: 'インプット',
      growth_rate: '成長率',
      ratio: '割合',
      link: '連動',
      custom_calc: '個別計算',
      prev_end_plus_change: '前期末+変動',
      sum_children: '子科目合計',
    };
    return names[type] || '未設定';
  };

  const ParameterAccountItem = ({
    item,
    level = 0,
    fs_type,
    parentIsCalculated = false,
  }: {
    item: any;
    level?: number;
    fs_type: string;
    parentIsCalculated?: boolean;
  }) => {
    const itemWithFsType = { ...item, fs_type };
    const hasChildren = item.children && item.children.length > 0;
    // GA(集計科目)かどうかを判定: aggregated GAには account_type が存在する
    const isGA = Boolean(item.account_type);

    // Get the rule from API-fetched rules
    const rule = rules.get(item.id);
    const uiConfig = rule ? convertRuleToUIConfig(rule) : null;

    // Use API rule if available, otherwise fall back to local parameter
    const effectiveParameter = uiConfig || item.parameter;

    const openParamModal = () => {
      if (isGA) return; // GAではモーダルを開かない
      setParamModal({
        isOpen: true,
        targetId: item.id,
        targetName: item.account_name,
        targetAccount: {
          ...itemWithFsType,
          aggregatedAccountsData: aggregatedAccountsData,
          parameter: effectiveParameter,
        },
      });
    };

    // Check if this item, any parent, or GA is calculated
    const isDisabled = isGA || item.isCalculated || parentIsCalculated;

    let statusDisplay;
    if (item.isCalculated) {
      statusDisplay = (
        <span className="text-sm text-gray-500">（自動計算）</span>
      );
    } else {
      let buttonText = 'パラメータ設定';
      let buttonClass = 'bg-blue-100 text-blue-700 hover:bg-blue-200';

      if (effectiveParameter) {
        if (effectiveParameter.type === 'periodic') {
          statusDisplay = (
            <button
              onClick={() =>
                setPeriodicModal({
                  isOpen: true,
                  targetId: item.id,
                  targetName: item.account_name,
                  initialSettings: effectiveParameter.config,
                })
              }
              disabled={isDisabled}
              className={`px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-md hover:bg-yellow-200 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                isGA ? '集計科目ではパラメータ設定はできません' : undefined
              }
            >
              期間別設定
            </button>
          );
        } else {
          buttonText = getParameterTypeName(effectiveParameter.type);
          buttonClass = 'bg-green-100 text-green-700 hover:bg-green-200';
          statusDisplay = (
            <button
              onClick={openParamModal}
              disabled={isDisabled}
              className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${buttonClass} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                isGA ? '集計科目ではパラメータ設定はできません' : undefined
              }
            >
              {buttonText}
            </button>
          );
        }
      } else if (hasChildren) {
        buttonText = '子科目合計';
        buttonClass =
          'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300';
        statusDisplay = (
          <button
            onClick={openParamModal}
            disabled={isDisabled}
            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${buttonClass} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isGA ? '集計科目ではパラメータ設定はできません' : undefined}
          >
            {buttonText}
          </button>
        );
      } else {
        statusDisplay = (
          <button
            onClick={openParamModal}
            disabled={isDisabled}
            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${buttonClass} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isGA ? '集計科目ではパラメータ設定はできません' : undefined}
          >
            {buttonText}
          </button>
        );
      }
    }

    return (
      <Fragment>
        <div
          className={`flex items-center justify-between p-2.5 border-b border-gray-200`}
          style={{ paddingLeft: `${1 + level * 1.5}rem` }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                item.isKpi ? 'text-gray-600 font-mono' : 'text-gray-800'
              }`}
            >
              {item.account_name}
            </span>
            {item.isKpi && (
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex-shrink-0">
                KPI
              </span>
            )}
          </div>
          <div className="flex-shrink-0">{statusDisplay}</div>
        </div>
        {item.children &&
          item.children.map((child: any) => (
            <ParameterAccountItem
              key={child.id}
              item={child}
              level={level + 1}
              fs_type={fs_type}
              parentIsCalculated={item.isCalculated || parentIsCalculated}
            />
          ))}
      </Fragment>
    );
  };

  const fsTypes = useMemo(() => {
    const defaultTypes: { [key: string]: string } = {
      PL: '損益計算書 (PL)',
      BS: '貸借対照表 (BS)',
      CF: 'キャッシュフロー計算書 (CF)',
    };
    const customTypes = Object.keys(accounts)
      .filter((key) => !(key in defaultTypes))
      .reduce<{ [key: string]: string }>((acc, key) => {
        acc[key] = key;
        return acc;
      }, {});
    return { ...defaultTypes, ...customTypes };
  }, [accounts]);

  return (
    <div className="max-w-4xl mx-auto">
      <ParameterSettingModal
        isOpen={paramModal.isOpen}
        onClose={() =>
          setParamModal({
            isOpen: false,
            targetId: null,
            targetName: '',
            targetAccount: null,
          })
        }
        onSave={handleSaveParameter}
        accountName={paramModal.targetName}
        onSetPeriodically={handleOpenPeriodicModal}
        accounts={accounts}
        setAccounts={setAccounts}
        targetAccount={paramModal.targetAccount}
      />
      <PeriodicParameterModal
        isOpen={periodicModal.isOpen}
        onClose={() =>
          setPeriodicModal({
            isOpen: false,
            targetId: null,
            targetName: '',
            initialSettings: null,
          })
        }
        onSave={handleSavePeriodicSettings}
        accountName={periodicModal.targetName}
        initialSettings={periodicModal.initialSettings}
      />

      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">パラメータ設定</h1>
          <p className="text-gray-600 mt-2">各科目のパラメータを設定します。</p>
          {savingStatus && (
            <div
              className={`mt-2 px-3 py-1 rounded-md text-sm font-medium inline-block ${
                savingStatus === '保存完了'
                  ? 'bg-green-100 text-green-700'
                  : savingStatus === '保存失敗'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {savingStatus}
            </div>
          )}
          {apiError && (
            <div className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm">
              エラー: {apiError}
            </div>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-md border border-gray-300 hover:bg-gray-100"
          >
            科目・KPI編集へ戻る
          </button>
          <button
            onClick={() => alert('モデルが作成されました！')}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
          >
            財務モデルを作成
          </button>
        </div>
      </header>
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {Object.entries(fsTypes).map(([key, name]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-shrink-0 px-6 py-3 font-semibold text-sm focus:outline-none transition-colors ${
                activeTab === key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div>
          {accounts[activeTab] &&
            accounts[activeTab].map((item: any) => (
              <ParameterAccountItem
                key={item.id}
                item={item}
                level={0}
                fs_type={activeTab}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

const UserAccountMappingCompletePage = () => {
  const {
    accounts: aggregatedAccountsData,
    loading,
    error,
  } = useFinancialAccounts();
  const {
    userAccounts,
    loading: uaLoading,
    error: uaError,
  } = useUserAccounts();

  // Debug: Log raw data
  useEffect(() => {
    // Empty effect for debugging
  }, [aggregatedAccountsData, userAccounts]);

  // Convert user accounts to the expected format
  const importedData = useMemo(() => {
    const converted = userAccounts.map((ua) => ({
      id: `ua-${ua.id}`,
      name: ua.ua_name,
      code: ua.ua_code,
      fs_type: ua.fs_type,
      is_credit: ua.is_credit,
      is_kpi: ua.is_kpi,
      parent_ga_id: ua.parent_ga_id,
      parent_ua_id: ua.parent_ua_id,
      parent_ga_name: ua.parent_ga_name || undefined,
      parent_ga_code: ua.parent_ga_code || undefined,
    }));
    return converted;
  }, [userAccounts]);

  const initialMappings = useMemo(() => {
    if (
      !aggregatedAccountsData ||
      aggregatedAccountsData.length === 0 ||
      !importedData ||
      importedData.length === 0
    )
      return {};
    const baseMappings: {
      [key: string]: { type: string; targetAccountId: string | null };
    } = {};
    importedData.forEach((item) => {
      baseMappings[item.id] = { type: 'ignore', targetAccountId: null };
    });
    const predefined = createPredefinedMappings(
      aggregatedAccountsData,
      importedData
    );
    return { ...baseMappings, ...predefined };
  }, [aggregatedAccountsData, importedData]);

  const [accounts, setAccounts] = useState<{ [key: string]: Account[] }>({
    PL: [],
    BS: [],
    CF: [],
  });
  const [view, setView] = useState('completion'); // 'completion', 'setup', 'parameters'

  useEffect(() => {
    // Try to load finalizedAccounts from localStorage first
    const storedAccounts = localStorage.getItem('finalizedAccounts');
    if (storedAccounts) {
      try {
        const parsedAccounts = JSON.parse(storedAccounts);
        setAccounts(parsedAccounts);
        // Clear the stored data after using it
        localStorage.removeItem('finalizedAccounts');
      } catch (e) {
        // Fallback to original logic
        if (initialMappings && aggregatedAccountsData.length > 0) {
          setAccounts(
            calculateAccountsStructure(
              initialMappings,
              aggregatedAccountsData,
              importedData
            )
          );
        }
      }
    } else if (initialMappings && aggregatedAccountsData.length > 0) {
      setAccounts(
        calculateAccountsStructure(
          initialMappings,
          aggregatedAccountsData,
          importedData
        )
      );
    }
  }, [initialMappings, aggregatedAccountsData, importedData]);

  const handleSaveSetup = (newAccounts: any) => {
    setAccounts(newAccounts);
    setView('completion');
  };

  const handleProceedToParams = () => {
    setView('parameters');
  };

  if (loading || uaLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (error || uaError) {
    return (
      <div className="p-8 text-center text-red-500">
        Error: {error || uaError}
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'setup':
        return (
          <AccountKpiSetupScreen
            accounts={accounts}
            setAccounts={setAccounts}
            onSave={handleSaveSetup}
          />
        );
      case 'parameters':
        return (
          <ParameterSetupScreen
            accounts={accounts}
            setAccounts={setAccounts}
            onBack={() => setView('setup')}
          />
        );
      case 'completion':
      default:
        return (
          <MappingCompletionScreen
            accounts={accounts}
            onEditClick={() => setView('setup')}
            onProceedToParamsClick={handleProceedToParams}
          />
        );
    }
  };

  return (
    <div className="bg-gray-100 p-4 sm:p-8 font-sans min-h-screen">
      {renderView()}
    </div>
  );
};

export default UserAccountMappingCompletePage;
