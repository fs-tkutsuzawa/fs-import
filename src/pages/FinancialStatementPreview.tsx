import React, {
  useState,
  useMemo,
  useCallback,
  Fragment,
  useEffect,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/FinancialStatementPreview.css';
import { useFinancialAccounts } from '../hooks/useFinancialAccounts';
import { useUserAccounts } from '../hooks/useUserAccounts';
import { getApiUrl } from '../config/api';
import { BackToTopButton } from '../components';

// --- Data Definitions ---

// --- Components ---
const getSuffix = (type: any) => {
  if (type === 'calculated') return '（自動計算）';
  if (type === 'reference') return '（参照）';
  if (type === 'sum_of_children') return '（子科目合計）';
  if (type === 'imported') return '（インポート科目）';
  if (type === 'user') return '（作成した科目）';
  return '';
};

const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }: any) => {
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            変更する
          </button>
        </div>
      </div>
    </div>
  );
};

const DeleteConfirmationModal = ({ isOpen, onConfirm, onCancel }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-1/3 max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-2">科目の削除</h3>
        <p className="text-gray-600 mb-6">
          この科目には子科目が紐づいています。削除方法を選択してください。
        </p>
        <div className="space-y-3">
          <button
            onClick={() => onConfirm(false)}
            className="w-full text-left p-3 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            <p className="font-semibold">この科目のみ削除</p>
            <p className="text-sm text-gray-500">
              子科目は1つ上の階層に移動します。
            </p>
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="w-full text-left p-3 bg-red-50 hover:bg-red-100 rounded-md"
          >
            <p className="font-semibold text-red-700">子科目を含めすべて削除</p>
            <p className="text-sm text-red-500">
              この科目に紐づくすべての子科目が削除されます。
            </p>
          </button>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountNode = ({
  accountId,
  level,
  isAggregated,
  aggregatedAccounts,
  dynamicAccounts,
  mappings,
  onAccountUpdate,
  editingAccountId,
  setEditingAccountId,
  addingAccountInfo,
  setAddingAccountInfo,
}: any) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (menuRef.current && !(menuRef.current as any).contains(event.target))
        setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuRef]);

  const account = isAggregated
    ? aggregatedAccounts.find((a: any) => a.id === accountId)
    : dynamicAccounts.find((i: any) => i.id === accountId);

  if (!account) return null;

  // デバッグログ: 自動計算GAの場合のみ
  if (isAggregated && account.mapping_type === 'calculated') {
    console.log(
      `\n=== 自動計算GA: ${account.account_name} (ID: ${account.id}) ===`
    );
    console.log(
      'dynamicAccounts全体:',
      dynamicAccounts.map((ua: any) => ({
        id: ua.id,
        name: ua.name,
        parent_ga_id: ua.parent_ga_id,
        parent_ua_id: ua.parent_ua_id,
      }))
    );
    console.log('mappings全体:', mappings);
  }

  const isEditing = editingAccountId === account.id;

  const handleNameUpdate = (newName: any) => {
    if (newName && newName.trim() !== account.name) {
      onAccountUpdate('update', {
        accountId: account.id,
        name: newName.trim(),
      });
    }
    setEditingAccountId(null);
  };

  const handleAddNewAccount = (name: any, parentId: any, addType: any) => {
    if (name && name.trim()) {
      onAccountUpdate('add', { name: name.trim(), parentId, addType });
    }
    setAddingAccountInfo(null);
  };

  const parentMapping = mappings[accountId];
  const parentId = parentMapping?.parentId;
  const parentAccount = aggregatedAccounts.find(
    (acc: any) => acc.id === parentId
  );
  const isDirectChildOfSum =
    parentAccount && parentAccount.mapping_type === 'sum_of_children';

  // 子要素の取得: GAの場合、mappingsとparent_ga_idベースで取得
  const children = isAggregated
    ? dynamicAccounts
        .filter((ua: any) => {
          const mappedToThis = mappings[ua.id]?.parentId === account.id;
          // `parent_ga_id` が一致する場合：
          // - `parent_ua_id` がある場合は他のUAの子なので、GAの直下には表示しない
          // - ただし、自動計算のGAの場合は、parent_ga_idが一致するすべてのUAを表示
          const isCalculatedGA = account.mapping_type === 'calculated';
          const directChild = isCalculatedGA
            ? ua.parent_ga_id === account.id
            : ua.parent_ga_id === account.id && !ua.parent_ua_id;

          // デバッグログ
          if (isCalculatedGA) {
            console.log(`[自動計算GA: ${account.account_name}] UAチェック:`, {
              ua_name: ua.name,
              ua_id: ua.id,
              parent_ga_id: ua.parent_ga_id,
              parent_ua_id: ua.parent_ua_id,
              account_id: account.id,
              mappedToThis,
              directChild,
              willShow: mappedToThis || directChild,
            });
          }

          return mappedToThis || directChild;
        })
        .map((ua: any) => ua.id)
    : Object.entries(mappings)
        .filter(([_, map]: any) => map.parentId === account.id)
        .map(([childId, _]) => childId);

  let nodeClasses = 'p-2 rounded-md transition-all relative my-1 group ';
  if (isAggregated) {
    nodeClasses +=
      account.mapping_type === 'sum_of_children'
        ? 'bg-green-50 border border-green-200'
        : 'bg-blue-50 border-blue-200';
  } else {
    nodeClasses +=
      account.type === 'imported'
        ? 'bg-gray-100 border border-gray-300'
        : 'bg-yellow-50 border border-yellow-300';
  }

  return (
    <Fragment>
      <div className={nodeClasses} style={{ marginLeft: `${level * 1.5}rem` }}>
        <div className="flex items-center justify-between">
          <div
            className="flex items-center min-w-0"
            onDoubleClick={() =>
              !isAggregated && setEditingAccountId(account.id)
            }
          >
            {isEditing ? (
              <input
                type="text"
                defaultValue={account.name}
                autoFocus
                onBlur={(e) => handleNameUpdate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleNameUpdate((e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setEditingAccountId(null);
                }}
                className="py-1 px-2 border border-blue-400 rounded-md w-full"
              />
            ) : (
              <span className="font-semibold truncate">
                {isAggregated ? account.account_name : account.name}
              </span>
            )}
            <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
              {getSuffix(isAggregated ? account.mapping_type : account.type)}
            </span>
          </div>
          <div className="relative" ref={menuRef as any}>
            <button
              onClick={() => setIsMenuOpen((prev: any) => !prev)}
              className="p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100"
            >
              ...
            </button>
            {isMenuOpen && (
              <div className="dropdown-menu w-48 bg-white border rounded-md shadow-lg">
                {!isAggregated && (
                  <button
                    onClick={() => {
                      setEditingAccountId(account.id);
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    編集
                  </button>
                )}
                {((isAggregated &&
                  account.mapping_type === 'sum_of_children') ||
                  !isAggregated) && (
                  <button
                    onClick={() => {
                      setAddingAccountInfo({
                        parentId: account.id,
                        type: 'childOf',
                      });
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    子科目として追加
                  </button>
                )}
                {!isAggregated && (
                  <button
                    onClick={() => {
                      setAddingAccountInfo({
                        parentId: account.id,
                        type: 'insertAbove',
                      });
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    兄弟科目として追加
                  </button>
                )}
                {!isAggregated && isDirectChildOfSum && (
                  <button
                    onClick={() => {
                      setAddingAccountInfo({
                        parentId: account.id,
                        type: 'insertBetween',
                      });
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    一階層上に追加
                  </button>
                )}
                {!isAggregated && (
                  <button
                    onClick={() => {
                      onAccountUpdate('delete', { accountId: account.id });
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {addingAccountInfo && addingAccountInfo.parentId === account.id && (
        <div
          style={{
            marginLeft: `${(level + (addingAccountInfo.type === 'childOf' ? 1 : 0)) * 1.5}rem`,
          }}
          className="my-1"
        >
          <input
            type="text"
            placeholder="新しい科目名"
            autoFocus
            onBlur={(e) =>
              handleAddNewAccount(
                e.target.value,
                account.id,
                addingAccountInfo.type
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                handleAddNewAccount(
                  (e.target as HTMLInputElement).value,
                  account.id,
                  addingAccountInfo.type
                );
              if (e.key === 'Escape') setAddingAccountInfo(null);
            }}
            className="py-1 px-2 border border-blue-400 rounded-md w-full text-sm"
          />
        </div>
      )}

      {children.map((childId: any) => (
        <AccountNode
          key={childId}
          accountId={childId}
          level={level + 1}
          isAggregated={false}
          aggregatedAccounts={aggregatedAccounts}
          dynamicAccounts={dynamicAccounts}
          mappings={mappings}
          onAccountUpdate={onAccountUpdate}
          editingAccountId={editingAccountId}
          setEditingAccountId={setEditingAccountId}
          addingAccountInfo={addingAccountInfo}
          setAddingAccountInfo={setAddingAccountInfo}
        />
      ))}
    </Fragment>
  );
};
const AccountTree = ({
  aggregatedAccounts,
  dynamicAccounts,
  mappings,
  onAccountUpdate,
}: any) => {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [addingAccountInfo, setAddingAccountInfo] = useState<{
    parentId: string;
    type: string;
  } | null>(null);

  const UnmappedAccounts = () => {
    const unmapped = dynamicAccounts.filter((acc: any) => {
      const hasMapping = mappings[acc.id];
      const hasParentGA =
        acc.parent_ga_id &&
        aggregatedAccounts.some((ga: any) => ga.id === acc.parent_ga_id);
      return acc.type === 'imported' && !hasMapping && !hasParentGA;
    });
    if (unmapped.length === 0) return null;
    return (
      <div className="mt-6">
        <h3 className="font-bold text-lg mb-2 text-gray-700">
          未マッピングのインポート科目
        </h3>
        <div className="p-2 border-dashed border-2 border-gray-300 rounded-md">
          {unmapped.map((acc: any) => (
            <div
              key={acc.id}
              className="p-2 my-1 bg-gray-200 text-gray-800 rounded-md"
            >
              {acc.name}
              <span className="text-xs text-gray-500 ml-2">
                {getSuffix(acc.type)}
              </span>
            </div>
          ))}
          <p className="text-xs text-center text-gray-500 mt-2">
            これらの科目を適切な集約科目の子として追加してください。
          </p>
        </div>
      </div>
    );
  };

  const fsTypes = {
    PL: '損益計算書 (PL)',
    BS: '貸借対照表 (BS)',
    CF: 'キャッシュフロー計算書 (CF)',
  };

  return (
    <div className="bg-white rounded-lg shadow-lg w-full h-full">
      <div className="scrollable-area">
        {Object.entries(fsTypes).map(([type, name]) => (
          <div key={type} className="mb-6">
            <h3 className="font-bold text-lg mb-2 text-gray-700 sticky top-0 bg-white py-1 z-20">
              {name}
            </h3>
            {aggregatedAccounts
              .filter((acc: any) => acc.fs_type === type)
              .sort((a: any, b: any) => a.order - b.order)
              .map((acc: any) => (
                <AccountNode
                  key={acc.id}
                  accountId={acc.id}
                  level={0}
                  isAggregated={true}
                  aggregatedAccounts={aggregatedAccounts}
                  dynamicAccounts={dynamicAccounts}
                  mappings={mappings}
                  onAccountUpdate={onAccountUpdate}
                  editingAccountId={editingAccountId}
                  setEditingAccountId={setEditingAccountId}
                  addingAccountInfo={addingAccountInfo}
                  setAddingAccountInfo={setAddingAccountInfo}
                />
              ))}
          </div>
        ))}
        <UnmappedAccounts />
      </div>
    </div>
  );
};

const FinancialStatementPreviewInternal = ({
  finalizedAccounts,
  onBack,
  onConfirm,
  showConfirmButton = false,
}: any) => {
  const [activeTab, setActiveTab] = useState('PL');
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());

  const toggleNode = (nodeId: any) => {
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
  };

  const renderAccountItem = (item: any, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isCollapsed = collapsedNodes.has(item.id);
    const rowBg =
      item.mapping_type === 'calculated'
        ? 'bg-blue-50 hover:bg-blue-100'
        : item.type === 'user'
          ? 'bg-yellow-50 hover:bg-yellow-100'
          : 'bg-white hover:bg-gray-50';
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
          <span
            className={`font-medium ${item.mapping_type === 'calculated' ? 'text-blue-800' : 'text-gray-800'}`}
          >
            {item.account_name}
            {item.ua_name ? item.ua_name : ''}
          </span>
          <span className="ml-3 text-xs text-gray-500">
            {getSuffix(item.mapping_type || item.type)}
          </span>
        </div>
        {hasChildren && !isCollapsed && (
          <div>
            {item.children
              .sort((a: any, b: any) => a.order - b.order)
              .map((child: any) => renderAccountItem(child, level + 1))}
          </div>
        )}
      </Fragment>
    );
  };

  const fsTypes = {
    PL: '損益計算書 (PL)',
    BS: '貸借対照表 (BS)',
    CF: 'キャッシュフロー計算書 (CF)',
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <header className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            財務諸表プレビュー
          </h1>
          <p className="text-gray-600 mt-2">
            マッピング結果を反映した勘定科目体系です。▼マークのある行をクリックして開閉できます。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-md border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            編集に戻る
          </button>
          {showConfirmButton && (
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
              className={`px-6 py-3 font-semibold text-sm focus:outline-none transition-colors ${activeTab === key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {name}
            </button>
          ))}
        </div>
        <div>
          {finalizedAccounts &&
            finalizedAccounts[activeTab] &&
            finalizedAccounts[activeTab].map((item: any) =>
              renderAccountItem(item)
            )}
        </div>
      </div>
    </div>
  );
};

const FinancialStatementPreview = () => {
  const navigate = useNavigate();
  const {
    accounts: aggregatedAccountsData,
    loading: gaLoading,
    error: gaError,
  } = useFinancialAccounts();
  const {
    userAccounts,
    loading: uaLoading,
    error: uaError,
  } = useUserAccounts();
  const [view, setView] = useState('mapping');
  const [finalizedAccounts] = useState(null);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  // Debug logs
  useEffect(() => {
    console.log('=== FinancialStatementPreview Debug ===');
    console.log('Global Accounts:', aggregatedAccountsData);
    console.log('User Accounts:', userAccounts);
  }, [aggregatedAccountsData, userAccounts]);

  // Use user accounts data instead of hardcoded data
  const importedData = useMemo(() => {
    return userAccounts.map((ua) => ({
      id: `ua-${ua.id}`,
      ua_db_id: ua.id, // Store the numeric DB ID for parent_ua_id references
      name: ua.ua_name,
      // Determine type based on ua_code
      // If ua_code starts with 'user-', it's manually added
      // If ua_code starts with 'imp-', it's imported
      type: ua.ua_code?.startsWith('user-') ? 'user' : 'imported',
      parent_ga_id: ua.parent_ga_id,
      parent_ua_id: ua.parent_ua_id,
      fs_type: ua.fs_type,
      ua_code: ua.ua_code,
    }));
  }, [userAccounts]);

  const [dynamicAccounts, setDynamicAccounts] = useState(importedData);

  useEffect(() => {
    setDynamicAccounts(importedData);
  }, [importedData]);

  const initialMappings = useMemo(() => {
    const mappings: { [key: string]: any } = {};

    // Build mappings based on parent relationships
    importedData.forEach((ua) => {
      // Check if this UA has a parent_ua_id (child of another UA)
      if (ua.parent_ua_id) {
        // Find the parent UA
        const parentUA = importedData.find(
          (parentUa) => parentUa.id === `ua-${ua.parent_ua_id}`
        );
        if (parentUA) {
          mappings[ua.id] = { parentId: parentUA.id };
          console.log(
            `Mapping UA "${ua.name}" to parent UA "${parentUA.name}"`
          );
        }
      }
      // Otherwise check if it has parent_ga_id (child of GA)
      else if (ua.parent_ga_id) {
        // Find the corresponding GA
        const parentGA = aggregatedAccountsData?.find(
          (ga) =>
            ga.id === ua.parent_ga_id ||
            ga.ga_code === ua.parent_ga_id ||
            ga.account_code === ua.parent_ga_id
        );
        if (parentGA) {
          mappings[ua.id] = { parentId: parentGA.id };
          console.log(
            `Mapping UA "${ua.name}" to GA "${parentGA.account_name || parentGA.ga_name}"`
          );
        }
      }
    });

    console.log('Initial mappings:', mappings);
    return mappings;
  }, [importedData, aggregatedAccountsData]);

  const [mappings, setMappings] = useState<{ [key: string]: any }>(
    initialMappings
  );
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    message: '',
    onConfirm: null,
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<any>({
    isOpen: false,
    onConfirm: null,
  });

  // Update mappings when initial mappings change
  useEffect(() => {
    setMappings(initialMappings);
    console.log('Updated mappings:', initialMappings);
  }, [initialMappings]);

  // Auto-clear save status after 3 seconds
  useEffect(() => {
    if (saveStatus === 'saved' || saveStatus === 'error') {
      const timer = setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleAccountUpdate = useCallback(
    async (action: any, payload: any) => {
      setSaveStatus('saving');

      if (action === 'add') {
        const { name, parentId, addType } = payload;
        const newId = `user-${Date.now()}`;

        // Determine parent GA and parent UA based on addType FIRST
        let parentGaId = null;
        let parentUaId = null;
        let fsType = null;

        // Find parent GA and FS type
        const parentAccount =
          aggregatedAccountsData?.find((ga: any) => ga.id === parentId) ||
          dynamicAccounts.find((ua: any) => ua.id === parentId);

        if (parentAccount) {
          if (aggregatedAccountsData?.find((ga: any) => ga.id === parentId)) {
            // Parent is a GA
            parentGaId = parentId;
            fsType = parentAccount.fs_type;
          } else {
            // Parent is a UA
            const parentUA = dynamicAccounts.find(
              (ua: any) => ua.id === parentId
            );

            console.log('Parent UA found:', {
              parentId,
              parentUA,
              ua_db_id: parentUA?.ua_db_id,
            });

            if (addType === 'childOf') {
              // Adding as child of UA
              parentGaId = parentUA?.parent_ga_id;
              fsType = parentUA?.fs_type;

              // Use the stored DB ID from the parent UA
              // If ua_db_id is not available, try to find it from userAccounts
              if (parentUA?.ua_db_id) {
                parentUaId = parentUA.ua_db_id;
              } else if (parentUA?.ua_code) {
                // Try to find the parent UA in the original userAccounts by ua_code
                const originalUA = userAccounts.find(
                  (ua) =>
                    `ua-${ua.id}` === parentId ||
                    ua.ua_code === parentUA.ua_code
                );
                parentUaId = originalUA?.id || null;
                console.log('Found parent_ua_id from userAccounts:', {
                  ua_code: parentUA.ua_code,
                  found_id: parentUaId,
                });
              } else {
                parentUaId = null;
              }

              console.log('Setting parent_ua_id for child:', {
                parentUaId,
                parentUA_full: parentUA,
              });
            } else if (addType === 'insertAbove') {
              // Adding as sibling of UA (same parent as target)
              const parentMapping = mappings[parentId];
              if (parentMapping?.parentId) {
                const grandParent = aggregatedAccountsData?.find(
                  (ga: any) => ga.id === parentMapping.parentId
                );
                if (grandParent) {
                  parentGaId = grandParent.id;
                  fsType = grandParent.fs_type;
                }
              } else if (parentUA?.parent_ga_id) {
                parentGaId = parentUA.parent_ga_id;
                fsType = parentUA.fs_type;
              }
            } else if (addType === 'insertBetween') {
              // Adding between parent GA and its children
              const parentMapping = mappings[parentId];
              if (parentMapping?.parentId) {
                const grandParent = aggregatedAccountsData?.find(
                  (ga: any) => ga.id === parentMapping.parentId
                );
                if (grandParent) {
                  parentGaId = grandParent.id;
                  fsType = grandParent.fs_type;
                }
              } else if (parentUA?.parent_ga_id) {
                parentGaId = parentUA.parent_ga_id;
                fsType = parentUA.fs_type;
              }
            }
          }
        }

        // Create new account with proper parent_ga_id
        const newAccount = {
          id: newId,
          ua_db_id: null, // Will be updated after save
          name,
          type: 'user',
          parent_ga_id: parentGaId,
          parent_ua_id: parentUaId,
          fs_type: fsType,
        };
        setDynamicAccounts((prev: any) => [...prev, newAccount]);

        // Save to database
        if (parentGaId && fsType) {
          try {
            const userAccountPayload: any = {
              ua_name: name,
              ua_code: newId,
              fs_type: fsType,
              is_kpi: false,
              parent_ga_id: parentGaId,
              parent_ua_id: parentUaId,
            };

            // Always send parent_ua_code if adding as child of UA, for server-side verification
            if (addType === 'childOf' && parentId.startsWith('ua-')) {
              const parentUA = dynamicAccounts.find(
                (ua: any) => ua.id === parentId
              );
              if (parentUA?.ua_code) {
                userAccountPayload.parent_ua_code = parentUA.ua_code;
                console.log(
                  'Added parent_ua_code for resolution:',
                  parentUA.ua_code,
                  'Current parent_ua_id:',
                  parentUaId
                );
              }
            }

            console.log('Saving user account to database:', {
              userAccountPayload,
              addType,
              parentId,
            });

            const response = await fetch(
              getApiUrl('/api/user-accounts/upsert'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userAccountPayload),
              }
            );

            if (!response.ok) {
              console.error('Failed to save user account to database');
              setSaveStatus('error');
            } else {
              const result = await response.json();
              console.log('User account saved successfully:', result);

              // Update the dynamic account with the actual DB ID
              if (result.account && result.account.id) {
                setDynamicAccounts((prev: any) =>
                  prev.map((acc: any) =>
                    acc.id === newId
                      ? { ...acc, ua_db_id: result.account.id }
                      : acc
                  )
                );
              }

              setSaveStatus('saved');
            }
          } catch (error) {
            console.error('Error saving user account:', error);
            setSaveStatus('error');
          }
        }

        if (addType === 'childOf') {
          setMappings((prev: any) => ({ ...prev, [newId]: { parentId } }));
        } else if (addType === 'insertAbove') {
          const targetParentId = mappings[parentId]?.parentId;
          if (targetParentId) {
            setMappings((prev: any) => ({
              ...prev,
              [newId]: { parentId: targetParentId },
            }));
          }
        } else if (addType === 'insertBetween') {
          const targetParentId = mappings[parentId]?.parentId;
          if (targetParentId) {
            setMappings((prev: any) => {
              const newMappings: any = { ...prev };
              const siblingsToMove = Object.keys(prev).filter(
                (id) => prev[id].parentId === targetParentId
              );
              newMappings[newId] = { parentId: targetParentId };
              siblingsToMove.forEach((siblingId) => {
                newMappings[siblingId] = {
                  ...prev[siblingId],
                  parentId: newId,
                };
              });
              return newMappings;
            });
          }
        }
      } else if (action === 'update') {
        const { accountId, name } = payload;
        setDynamicAccounts((prev: any) =>
          prev.map((acc: any) =>
            acc.id === accountId ? { ...acc, name } : acc
          )
        );

        // Update in database if it's a user account that exists in DB
        const account = dynamicAccounts.find(
          (acc: any) => acc.id === accountId
        );
        if (account && accountId.startsWith('ua-')) {
          try {
            const uaId = accountId.replace('ua-', '');
            const response = await fetch(
              getApiUrl(`/api/user-accounts/${uaId}`),
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ua_name: name }),
              }
            );

            if (!response.ok) {
              console.error('Failed to update user account in database');
              setSaveStatus('error');
            } else {
              console.log('User account updated successfully');
              setSaveStatus('saved');
            }
          } catch (error) {
            console.error('Error updating user account:', error);
            setSaveStatus('error');
          }
        }
      } else if (action === 'delete') {
        const { accountId } = payload;
        const children = Object.keys(mappings).filter(
          (id) => mappings[id].parentId === accountId
        );

        const performDelete = async (deleteChildren: boolean) => {
          const accountsToDelete = [accountId];
          if (deleteChildren) {
            const getAllDescendants = (id: string): string[] => {
              const descendants: string[] = [];
              const directChildren = Object.keys(mappings).filter(
                (childId) => mappings[childId].parentId === id
              );
              descendants.push(...directChildren);
              directChildren.forEach((child) =>
                descendants.push(...getAllDescendants(child))
              );
              return descendants;
            };
            accountsToDelete.push(...getAllDescendants(accountId));
          }

          // Delete from database for user accounts that exist in DB
          for (const id of accountsToDelete) {
            if (id.startsWith('ua-')) {
              try {
                const uaId = id.replace('ua-', '');
                const response = await fetch(
                  getApiUrl(`/api/user-accounts/${uaId}`),
                  {
                    method: 'DELETE',
                  }
                );

                if (!response.ok) {
                  console.error(
                    `Failed to delete user account ${uaId} from database`
                  );
                  setSaveStatus('error');
                } else {
                  console.log(`User account ${uaId} deleted successfully`);
                  setSaveStatus('saved');
                }
              } catch (error) {
                console.error(`Error deleting user account ${id}:`, error);
                setSaveStatus('error');
              }
            }
          }

          setDynamicAccounts((prev: any) =>
            prev.filter((acc: any) => !accountsToDelete.includes(acc.id))
          );
          setMappings((prev: any) => {
            const newMappings: any = { ...prev };
            accountsToDelete.forEach((id) => delete newMappings[id]);

            if (!deleteChildren) {
              const parentId = prev[accountId]?.parentId;
              children.forEach((childId) => {
                if (parentId)
                  newMappings[childId] = { ...newMappings[childId], parentId };
                else delete newMappings[childId];
              });
            }
            return newMappings;
          });
          setDeleteConfirmation({ isOpen: false, onConfirm: null });
        };

        if (children.length > 0) {
          setDeleteConfirmation({
            isOpen: true,
            onConfirm: (deleteChildren: any) => performDelete(deleteChildren),
          });
        } else {
          performDelete(true);
        }
      }
    },
    [
      mappings,
      aggregatedAccountsData,
      dynamicAccounts,
      userAccounts,
      setSaveStatus,
    ]
  );

  if (view === 'preview' && finalizedAccounts) {
    return (
      <FinancialStatementPreviewInternal
        finalizedAccounts={finalizedAccounts}
        onBack={() => setView('mapping')}
      />
    );
  }

  if (gaLoading || uaLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (gaError || uaError) {
    return (
      <div className="p-8 text-center text-red-500">
        Error: {gaError || uaError}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        message={confirmation.message}
        onConfirm={confirmation.onConfirm}
        onCancel={() =>
          setConfirmation({ isOpen: false, message: '', onConfirm: null })
        }
      />
      <DeleteConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onConfirm={deleteConfirmation.onConfirm}
        onCancel={() =>
          setDeleteConfirmation({ isOpen: false, onConfirm: null })
        }
      />
      <div className="w-full">
        <header className="mb-6 flex justify-between items-center px-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              勘定科目マッピング
            </h1>
            <p className="text-gray-600 mt-2">
              科目メニューから体系を編集します。科目名をダブルクリックして編集も可能です。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BackToTopButton />
            {saveStatus === 'saving' && (
              <span className="text-sm text-gray-600 animate-pulse">
                保存中...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-sm text-green-600">✓ 保存済み</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-600">保存エラー</span>
            )}
            <button
              onClick={() => navigate('/userAccountMappingComplete')}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              プレビューを確認
            </button>
          </div>
        </header>

        <div className="fs-main-container">
          <AccountTree
            aggregatedAccounts={aggregatedAccountsData}
            dynamicAccounts={dynamicAccounts}
            mappings={mappings}
            onAccountUpdate={handleAccountUpdate}
          />
        </div>
      </div>
    </div>
  );
};

export default FinancialStatementPreview;
export { FinancialStatementPreviewInternal };
