import React, { useState } from 'react';
import {
  getAllFsTypes,
  getGlobalAccountsByFsType,
  createNewUserAccount,
  GlobalAccount,
} from '../api/userAccountsApi';

interface NewAccount {
  id: string;
  ua_name: string;
  fs_type: string;
  ga_id?: string;
}

interface AddNewAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newAccount: NewAccount) => void;
}

export const AddNewAccountDialog: React.FC<AddNewAccountDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'select-sheet' | 'select-ga' | 'enter-name'>(
    'select-sheet'
  );
  const [fsTypes, setFsTypes] = useState<string[]>([]);
  const [selectedFsType, setSelectedFsType] = useState<string>('');
  const [isNewSheet, setIsNewSheet] = useState<boolean>(false);
  const [newSheetName, setNewSheetName] = useState<string>('');
  const [globalAccounts, setGlobalAccounts] = useState<GlobalAccount[]>([]);
  const [selectedGA, setSelectedGA] = useState<GlobalAccount | null>(null);
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          setLoading(true);
          const types = await getAllFsTypes();
          setFsTypes(types);
          setError(null);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to load fs_types'
          );
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isOpen]);

  const handleFsTypeSelect = async (fsType: string, isNew = false) => {
    setSelectedFsType(fsType);
    setIsNewSheet(isNew);
    if (!isNew) {
      try {
        setLoading(true);
        const accounts = await getGlobalAccountsByFsType(fsType);
        setGlobalAccounts(accounts);
        setStep('select-ga');
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load global accounts'
        );
      } finally {
        setLoading(false);
      }
    } else {
      setStep('enter-name');
    }
  };

  const handleGASelect = (ga: GlobalAccount) => {
    setSelectedGA(ga);
    setStep('enter-name');
  };

  const handleSubmit = async () => {
    if (!newAccountName.trim()) {
      setError('科目名を入力してください');
      return;
    }
    try {
      setLoading(true);
      const accountData = {
        ua_name: newAccountName.trim(),
        fs_type: isNewSheet ? newSheetName : selectedFsType,
        parent_ga_id: selectedGA?.id || '',
        is_kpi: false,
        is_credit: null,
        parent_ua_id: null,
        ua_code: null,
      };
      const result = await createNewUserAccount(accountData);
      setError(null);
      onSuccess?.(result.account);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('select-sheet');
    setSelectedFsType('');
    setIsNewSheet(false);
    setNewSheetName('');
    setGlobalAccounts([]);
    setSelectedGA(null);
    setNewAccountName('');
    setError(null);
    onClose();
  };

  const handleBack = () => {
    if (step === 'enter-name') {
      setStep(isNewSheet ? 'select-sheet' : 'select-ga');
      setNewAccountName('');
    } else if (step === 'select-ga') {
      setStep('select-sheet');
      setSelectedGA(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div
          className="px-6 py-4 border-b border-gray-200"
          data-testid="add-account-dialog"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            新規科目を追加
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {step === 'select-sheet' && 'Step 1: シートを選択'}
            {step === 'select-ga' && 'Step 2: 紐付け先グローバル科目を選択'}
            {step === 'enter-name' && 'Step 3: 科目名を入力'}
          </p>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {step === 'select-sheet' && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">
                既存のシートを選択、または新しいシートを作成
              </h3>
              <div className="space-y-2">
                {fsTypes.map((fsType) => (
                  <button
                    key={fsType}
                    onClick={() => handleFsTypeSelect(fsType, false)}
                    className="w-full text-left px-4 py-3 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-blue-500 transition-colors"
                    data-testid={`sheet-btn-${fsType}`}
                  >
                    <span className="font-medium">{fsType}</span>
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-200">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-500">
                    新しいシートを作成
                  </label>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-2">
                    <p className="text-xs text-yellow-800">
                      ⚠ データベース制約により、現在は既存のシート（
                      {fsTypes.join(', ')}）のみ使用可能です。
                      新規シートを追加するには、まずデータベースの fs_type
                      制約を更新する必要があります。
                    </p>
                  </div>
                  <input
                    type="text"
                    placeholder="新しいシート名（例: PPE, CUSTOM）"
                    value={newSheetName}
                    onChange={(e) =>
                      setNewSheetName(e.target.value.toUpperCase())
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 cursor-not-allowed"
                    disabled
                  />
                  <button
                    disabled
                    className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
                  >
                    新しいシートを作成（現在利用不可）
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'select-ga' && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">
                紐付け先グローバル科目を選択（{selectedFsType}）
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {globalAccounts.map((ga) => (
                  <button
                    key={ga.id}
                    onClick={() => handleGASelect(ga)}
                    className="w-full text-left px-4 py-3 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-blue-500 transition-colors"
                    data-testid={`ga-item-${ga.id}`}
                  >
                    <div>
                      <span className="font-medium">{ga.ga_name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({ga.ga_code})
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Type: {ga.ga_type}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'enter-name' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  選択内容の確認
                </h3>
                <div className="bg-gray-50 p-3 rounded-md space-y-1 text-sm">
                  <p>
                    <span className="font-medium">シート</span>{' '}
                    {isNewSheet ? `${newSheetName} (新規)` : selectedFsType}
                  </p>
                  {selectedGA && (
                    <p>
                      <span className="font-medium">紐付け先</span>{' '}
                      {selectedGA.ga_name} ({selectedGA.ga_code})
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  新しい科目名
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="科目名を入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  data-testid="new-account-name-input"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={step === 'select-sheet' ? handleClose : handleBack}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            {step === 'select-sheet' ? 'キャンセル' : '戻る'}
          </button>

          {step === 'enter-name' && (
            <button
              onClick={handleSubmit}
              disabled={loading || !newAccountName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-testid="create-account-btn"
            >
              {loading ? '作成中...' : '作成'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
