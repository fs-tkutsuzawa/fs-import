import React, { useState } from 'react';
import { useUserAccounts } from '../hooks/useUserAccounts';
import { AddNewAccountDialog, BackToTopButton } from '../components';
import { KPIToggle } from '../components/KPIToggle';

export const AccountManagementPage: React.FC = () => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showKPIOnly, setShowKPIOnly] = useState(false);
  const { userAccounts, loading, error } = useUserAccounts({
    kpiOnly: showKPIOnly,
  });

  const handleAccountCreated = () => {
    // Refresh will happen automatically through the hook
  };

  const handleKPIToggle = (_accountId: number, _newValue: boolean) => {
    // Refresh will happen automatically through the hook
  };

  const accountsBySheet = userAccounts.reduce(
    (acc, account) => {
      if (!acc[account.fs_type])
        acc[account.fs_type] = [] as typeof userAccounts;
      acc[account.fs_type].push(account);
      return acc;
    },
    {} as Record<string, typeof userAccounts>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">科目管理</h1>
            <p className="text-gray-600 mt-2">ユーザー定義科目の管理・追加</p>
          </div>
          <BackToTopButton />
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              data-testid="add-account-btn"
            >
              + 新規科目を追加
            </button>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showKPIOnly}
                onChange={(e) => setShowKPIOnly(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid="kpi-only-checkbox"
              />
              <span className="text-sm text-gray-700">KPI科目のみ表示</span>
            </label>
          </div>

          <div className="text-sm text-gray-500">
            合計 {userAccounts.length} 件
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {Object.keys(accountsBySheet).length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500">科目が見つかりません</p>
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  最初の科目を追加
                </button>
              </div>
            ) : (
              Object.entries(accountsBySheet).map(([fsType, accounts]) => (
                <div
                  key={fsType}
                  className="bg-white rounded-lg shadow-sm overflow-hidden"
                >
                  <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {fsType}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({accounts.length} 件)
                      </span>
                    </h2>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            科目名
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            科目コード
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            紐付け先GA
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            KPI
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {accounts.map((account) => (
                          <tr key={account.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {account.id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {account.ua_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {account.ua_code || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {account.parent_ga_name || account.parent_ga_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <KPIToggle
                                accountId={account.id}
                                isKPI={account.is_kpi}
                                onToggle={(newValue) =>
                                  handleKPIToggle(account.id, newValue)
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <AddNewAccountDialog
          isOpen={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={handleAccountCreated}
        />
      </div>
    </div>
  );
};
