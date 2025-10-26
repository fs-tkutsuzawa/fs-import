import React, {
  useState,
  useMemo,
  useCallback,
  Fragment,
  useEffect,
} from 'react';
import { useFinancialAccounts } from '../hooks/useFinancialAccounts';
import { BackToTopButton } from '../components';

const getAccountLabel = (account: any) => {
  const isReference =
    account.id === 'cash_and_deposits' || account.id === 'opening_cash';
  const isTotalEquity = account.id === 'total_equity';

  if (isReference) {
    return {
      text: '（参照）',
      className: 'ml-2 text-xs text-green-600 font-normal',
    };
  }
  if (isTotalEquity) {
    return {
      text: '（子科目合計）',
      className: 'ml-2 text-xs text-gray-500 font-normal',
    };
  }
  if (account.isCalculated) {
    return {
      text: '（自動計算）',
      className: 'ml-2 text-xs text-blue-500 font-normal',
    };
  }
  if (account.account_type === 'aggregate') {
    return {
      text: '（子科目合計）',
      className: 'ml-2 text-xs text-gray-500 font-normal',
    };
  }
  if (account.account_name.includes('合計')) {
    return {
      text: '（子科目合計）',
      className: 'ml-2 text-xs text-gray-500 font-normal',
    };
  }
  return null; // No label
};

const ToggleSwitch = ({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) => {
  const bgClass = active ? 'bg-blue-600' : 'bg-gray-300';
  const handleClass = active ? 'translate-x-full' : 'translate-x-0';
  return (
    <button
      onClick={onClick}
      className={`${bgClass} relative inline-flex items-center h-6 rounded-full w-11 focus:outline-none transition-colors`}
      title="この科目を含める/含めない"
    >
      <span
        className={`${handleClass} toggle-switch-handle inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out`}
      />
    </button>
  );
};

const AccountItem = ({
  account,
  optionalState,
  onToggle,
  onNameUpdate,
}: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(account.account_name);
  const isActive = !account.is_optional || optionalState[account.id];

  const handleNameChange = () => {
    if (tempName.trim()) {
      onNameUpdate(account.id, tempName.trim());
    } else {
      setTempName(account.account_name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleNameChange();
    if (e.key === 'Escape') {
      setTempName(account.account_name);
      setIsEditing(false);
    }
  };

  const itemOpacity = isActive ? 'opacity-100' : 'opacity-40';
  const backgroundClass = account.isCalculated ? 'bg-blue-50' : '';
  const textColorClass = account.isCalculated
    ? 'font-semibold text-blue-700'
    : 'text-gray-800';
  const label = getAccountLabel(account);

  return (
    <Fragment>
      <div
        className={`flex items-center space-x-2 p-2.5 hover:bg-gray-50 transition-all duration-150 ${itemOpacity} ${backgroundClass}`}
        style={{
          paddingLeft: `${Number(account.indent_num || 0) * 20}px`,
        }}
      >
        <div
          style={{
            minWidth: '70px',
            flexShrink: 0,
          }}
          className="flex items-center justify-end"
        >
          {account.is_optional && (
            <ToggleSwitch
              active={isActive}
              onClick={() => onToggle(account.id)}
            />
          )}
        </div>
        <div className="flex-grow">
          {isEditing ? (
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameChange}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 border border-blue-400 rounded-md shadow-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              autoFocus
            />
          ) : (
            <span className={`text-sm ${textColorClass}`}>
              {account.account_name}
              {label && <span className={label.className}>{label.text}</span>}
            </span>
          )}
        </div>
        <div className="flex-shrink-0 pr-2">
          <button
            onClick={() => setIsEditing((prev) => !prev)}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="科目名を編集"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
              <path
                fillRule="evenodd"
                d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </Fragment>
  );
};

// AccountItemReversed component removed - not used in the application
const FinancialModelSetupPage = () => {
  const { accounts, loading, error, updateAccountName } =
    useFinancialAccounts();
  const [activeTab, setActiveTab] = useState('PL');

  const [optionalState, setOptionalState] = useState<{
    [key: string]: boolean;
  }>({});

  useEffect(() => {
    if (accounts.length > 0) {
      const initialState: { [key: string]: boolean } = {};
      accounts
        .filter((item: any) => item.is_optional)
        .forEach((item: any) => {
          initialState[item.id] = true;
        });
      setOptionalState(initialState);
    }
  }, [accounts]);

  const handleToggle = useCallback((id: string) => {
    setOptionalState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const { plItems, bsItems, cfItems } = useMemo(() => {
    const sortFn = (a: any, b: any) => (a.sort_num || 0) - (b.sort_num || 0);
    const pl = accounts.filter((item) => item.fs_type === 'PL').sort(sortFn);
    const bs = accounts.filter((item) => item.fs_type === 'BS').sort(sortFn);
    const cf = accounts.filter((item) => item.fs_type === 'CF').sort(sortFn);
    return { plItems: pl, bsItems: bs, cfItems: cf };
  }, [accounts]);

  const renderContent = () => {
    const commonProps = {
      optionalState,
      onToggle: handleToggle,
      onNameUpdate: updateAccountName,
    };

    const renderItems = (items: any[]) => {
      return items.map((account) => (
        <AccountItem key={account.id} account={account} {...commonProps} />
      ));
    };

    switch (activeTab) {
      case 'PL':
        return renderItems(plItems);
      case 'BS':
        return renderItems(bsItems);
      case 'CF':
        return renderItems(cfItems);
      default:
        return null;
    }
  };

  const tabs = [
    { key: 'PL', name: '損益計算書' },
    { key: 'BS', name: '貸借対照表' },
    { key: 'CF', name: 'キャッシュフロー計算書' },
  ];

  if (loading) {
    return (
      <div className="bg-gray-100 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">データを読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-100 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
          <div className="p-6 text-center">
            <div className="text-red-500 mb-2">
              <svg
                className="h-8 w-8 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-red-600">エラーが発生しました: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
        <header className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">集約科目設定</h1>
              <p className="text-gray-600 mt-2">
                財務諸表の集約科目を管理します。
              </p>
            </div>
            <BackToTopButton />
          </div>
        </header>

        <div className="flex border-b">
          {tabs.map(({ key, name }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-6 py-3 font-medium transition-colors text-sm focus:outline-none ${
                activeTab === key
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <main className="p-2 sm:p-4">
          <div className="border rounded-lg overflow-hidden">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default FinancialModelSetupPage;
