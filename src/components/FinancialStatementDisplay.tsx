import React, { useState, Fragment } from 'react';

interface AccountItem {
  id: string;
  account_name: string;
  mapping_type?: string;
  type?: string;
  children?: AccountItem[];
  order?: number;
  fs_type?: string;
  isCalculated?: boolean;
  isKpi?: boolean;
}

interface FinancialStatementDisplayProps {
  finalizedAccounts: {
    PL?: AccountItem[];
    BS?: AccountItem[];
    CF?: AccountItem[];
    [key: string]: AccountItem[] | undefined;
  };
  onBack?: () => void;
  onConfirm?: () => void;
  showConfirmButton?: boolean;
  showBackButton?: boolean;
  title?: string;
  description?: string;
}

const getSuffix = (account: AccountItem) => {
  if (account.mapping_type === 'calculated' || account.isCalculated)
    return '（自動計算）';
  if (account.mapping_type === 'reference') return '（参照）';
  if (account.mapping_type === 'sum_of_children') return '（子科目合計）';
  if (account.type === 'imported') return '（インポート科目）';
  if (account.type === 'user') return '（作成した科目）';
  if (account.type === 'child' || account.type === 'mapped') return '';
  if (account.isKpi) return '';
  return '';
};

const FinancialStatementDisplay: React.FC<FinancialStatementDisplayProps> = ({
  finalizedAccounts,
  onBack,
  onConfirm,
  showConfirmButton = false,
  showBackButton = true,
  title = '財務諸表プレビュー',
  description = 'マッピング結果を反映した勘定科目体系です。▼マークのある行をクリックして開閉できます。',
}) => {
  const [activeTab, setActiveTab] = useState('PL');
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());

  const toggleNode = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
  };

  const renderAccountItem = (item: AccountItem, level = 0): JSX.Element => {
    const hasChildren = item.children && item.children.length > 0;
    const isCollapsed = collapsedNodes.has(item.id);

    let rowBg = 'bg-white hover:bg-gray-50';
    if (item.mapping_type === 'calculated' || item.isCalculated) {
      rowBg = 'bg-blue-50 hover:bg-blue-100';
    } else if (item.type === 'user') {
      rowBg = 'bg-yellow-50 hover:bg-yellow-100';
    } else if (item.isKpi) {
      rowBg = 'bg-purple-50 hover:bg-purple-100';
    }

    const rowCursor = hasChildren ? 'cursor-pointer' : 'cursor-default';

    return (
      <Fragment key={item.id}>
        <div
          className={`flex items-center p-2.5 border-b border-gray-200 transition-colors ${rowBg} ${rowCursor}`}
          style={{ paddingLeft: `${1 + level * 1.5}rem` }}
          onClick={() => hasChildren && toggleNode(item.id)}
        >
          <div className="w-6 flex-shrink-0">
            {hasChildren && (
              <span
                className={`text-gray-500 transform transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
              >
                ▼
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${item.isKpi ? 'text-purple-800 font-mono' : item.mapping_type === 'calculated' || item.isCalculated ? 'text-blue-800' : 'text-gray-800'}`}
            >
              {item.account_name}
            </span>
            {item.isKpi && (
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                KPI
              </span>
            )}
            <span className="ml-3 text-xs text-gray-500">
              {getSuffix(item)}
            </span>
          </div>
        </div>
        {hasChildren && !isCollapsed && (
          <div>
            {item
              .children!.sort((a, b) => (a.order || 999) - (b.order || 999))
              .map((child) => renderAccountItem(child, level + 1))}
          </div>
        )}
      </Fragment>
    );
  };

  const fsTypes: { [key: string]: string } = {
    PL: '損益計算書 (PL)',
    BS: '貸借対照表 (BS)',
    CF: 'キャッシュフロー計算書 (CF)',
  };

  // Add custom sheets if any
  Object.keys(finalizedAccounts).forEach((key) => {
    if (!fsTypes[key]) {
      fsTypes[key] = key;
    }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-2">{description}</p>
        </div>
        <div className="flex gap-2">
          {showBackButton && onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-md border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
            >
              編集に戻る
            </button>
          )}
          {showConfirmButton && onConfirm && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors shadow-sm"
            >
              確定
            </button>
          )}
        </div>
      </header>
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="flex border-b border-gray-200">
          {Object.entries(fsTypes).map(([key, name]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-6 py-3 font-semibold text-sm focus:outline-none transition-colors ${
                activeTab === key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {finalizedAccounts &&
            finalizedAccounts[activeTab] &&
            finalizedAccounts[activeTab]!.map((item) =>
              renderAccountItem(item)
            )}
        </div>
      </div>
    </div>
  );
};

export default FinancialStatementDisplay;
